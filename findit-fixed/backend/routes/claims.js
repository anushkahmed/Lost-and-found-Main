// routes/claims.js — claim submission, approval/rejection, anti-fraud signals.
//
// Hardening:
//   • ObjectId validation on every :id and itemId.
//   • All email interpolation is HTML-escaped (defense against an admin/user
//     entering a name containing "<script>...").
//   • Trust score adjustments use atomic $inc + a second clamp pass.
//   • Claims are immutable for non-admins; the audit log captures every
//     state transition (`logHistory`).

const express = require('express');
const router  = express.Router();

const Item = require('../models/Item');
const User = require('../models/User');
const { Claim, Notification } = require('../models/OtherModels');
const { ItemHistory } = require('../models/Phase2Models');
const { sendEmail, wrap } = require('../utils/email');
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { requireObjectId, isObjectId } = require('../middleware/security');

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const logHistory = (entry) => {
  ItemHistory.create(entry).catch((e) => console.error('ItemHistory log failed:', e.message));
};

async function clampTrustScore(userId) {
  const u = await User.findById(userId).select('trustScore');
  if (!u) return;
  const clamped = Math.max(0, Math.min(100, Number(u.trustScore) || 0));
  if (clamped !== u.trustScore) {
    await User.findByIdAndUpdate(userId, { trustScore: clamped });
  }
}

// POST /api/claims — Submit a claim
router.post('/', protect, asyncHandler(async (req, res) => {
  const itemId = req.body.itemId;
  const description = (typeof req.body.description === 'string' ? req.body.description.trim() : '').slice(0, 1000);
  const answers = req.body.answers;

  if (!isObjectId(itemId)) return res.status(400).json({ message: 'Valid itemId required' });
  if (!description) return res.status(400).json({ message: 'description is required' });

  const item = await Item.findById(itemId).populate('postedBy');
  if (!item) return res.status(404).json({ message: 'Item not found' });
  if (item.status !== 'found') return res.status(400).json({ message: 'Item is not available to claim' });
  if (item.isHighValue && item.highValueApproved === false) {
    return res.status(403).json({ message: 'High-value item is pending admin approval' });
  }

  if (item.postedBy._id.toString() === req.user._id.toString()) {
    return res.status(400).json({ message: 'You cannot claim an item you posted' });
  }

  const alreadyClaimed = await Claim.findOne({ itemId, claimantId: req.user._id });
  if (alreadyClaimed) {
    return res.status(400).json({ message: 'You already submitted a claim for this item' });
  }

  const qs = Array.isArray(item.ownershipQuestions) ? item.ownershipQuestions : [];
  let normalizedAnswers = [];
  if (qs.length > 0) {
    if (!Array.isArray(answers) || answers.length !== qs.length) {
      return res.status(400).json({ message: 'Ownership question answers are required' });
    }
    normalizedAnswers = answers.map((a, i) => ({
      question: (qs[i]?.question || '').toString().slice(0, 500),
      answer: (a?.answer || a || '').toString().trim().slice(0, 1000),
    }));
    const missing = normalizedAnswers.some(a => !a.answer);
    if (missing) return res.status(400).json({ message: 'Please answer all ownership questions' });
  }

  const claim = await Claim.create({ itemId, claimantId: req.user._id, description, answers: normalizedAnswers });

  const admins = await User.find({ role: 'admin' }, '_id');
  const notifMsg = `${req.user.name} claimed "${item.name}": "${description}"`;

  const notifDocs = admins.map(admin => ({
    userId: admin._id, type: 'claim',
    title: `New claim on "${item.name}"`,
    message: notifMsg, itemId: item._id, read: false,
  }));
  await Notification.insertMany(notifDocs);

  admins.forEach(admin => {
    req.io.to(admin._id.toString()).emit('item:claim', {
      message: `New claim on "${item.name}" by ${req.user.name}`,
      claimId: claim._id
    });
  });

  res.status(201).json(claim);
}));

// GET /api/claims — Admin sees all; user sees their own
router.get('/', protect, asyncHandler(async (req, res) => {
  const query = req.user.role === 'admin' ? {} : { claimantId: req.user._id };
  const claims = await Claim.find(query)
    .populate('itemId')
    .populate('claimantId', 'name email')
    .sort({ createdAt: -1 })
    .limit(500);
  res.json(claims);
}));

// PUT /api/claims/:id — Approve or reject
router.put('/:id', protect, adminOnly, requireObjectId('id'), asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'status must be approved or rejected' });
  }

  const claim = await Claim.findByIdAndUpdate(req.params.id, { status }, { new: true })
    .populate('itemId').populate('claimantId', 'name email');

  if (!claim) return res.status(404).json({ message: 'Claim not found' });

  if (status === 'approved') {
    const itemDoc = await Item.findByIdAndUpdate(claim.itemId._id, { status: 'returned' }, { new: true });
    logHistory({
      itemId: claim.itemId._id, changedBy: req.user._id,
      action: 'claim:approved', fromStatus: 'found', toStatus: 'returned',
      meta: { claimId: claim._id, claimantId: claim.claimantId._id }
    });

    await User.findByIdAndUpdate(claim.claimantId._id, { $inc: { trustScore: 10, points: 10 } });
    await clampTrustScore(claim.claimantId._id);

    if (itemDoc?.postedBy) {
      const reward = itemDoc.isHighValue ? 50 : 20;
      await User.findByIdAndUpdate(itemDoc.postedBy, { $inc: { points: reward, trustScore: 5 } });
      await clampTrustScore(itemDoc.postedBy);
    }

    await Notification.create({
      userId: claim.claimantId._id, type: 'status',
      title: '✅ Claim approved!',
      message: `Your claim for "${claim.itemId.name}" was approved. Please collect it.`,
      itemId: claim.itemId._id, read: false,
    });

    req.io.to(claim.claimantId._id.toString()).emit('claim:approved', {
      message: `Your claim for "${claim.itemId.name}" was approved!`
    });

    sendEmail({
      to: claim.claimantId.email,
      subject: `✅ Your claim for "${claim.itemId.name}" was approved`,
      html: wrap('Your claim was approved',
        `<p>Hi ${escapeHtml(claim.claimantId.name) || 'there'},</p>
         <p>Good news! Your claim for <strong>${escapeHtml(claim.itemId.name)}</strong> has been approved by a campus admin.</p>
         <p>Please visit the listing in the FindIt portal to coordinate pickup. Bring an ID for verification.</p>`)
    }).catch(() => {});

  } else if (status === 'rejected') {
    logHistory({
      itemId: claim.itemId._id, changedBy: req.user._id,
      action: 'claim:rejected', fromStatus: claim.itemId.status, toStatus: claim.itemId.status,
      meta: { claimId: claim._id, claimantId: claim.claimantId._id }
    });
    await User.findByIdAndUpdate(claim.claimantId._id, { $inc: { trustScore: -5 } });
    const rejectedCount = await Claim.countDocuments({ claimantId: claim.claimantId._id, status: 'rejected' });
    if (rejectedCount >= 3) {
      await User.findByIdAndUpdate(claim.claimantId._id, { $inc: { trustScore: -15 } });
    }
    await clampTrustScore(claim.claimantId._id);

    await Notification.create({
      userId: claim.claimantId._id, type: 'status',
      title: '❌ Claim not approved',
      message: `Your claim for "${claim.itemId.name}" was not approved this time.`,
      itemId: claim.itemId._id, read: false,
    });

    req.io.to(claim.claimantId._id.toString()).emit('claim:rejected', {
      message: `Your claim for "${claim.itemId.name}" was not approved.`
    });

    sendEmail({
      to: claim.claimantId.email,
      subject: `Update on your claim for "${claim.itemId.name}"`,
      html: wrap('Your claim was not approved',
        `<p>Hi ${escapeHtml(claim.claimantId.name) || 'there'},</p>
         <p>After review, your claim for <strong>${escapeHtml(claim.itemId.name)}</strong> was not approved this time.</p>
         <p>If you have additional proof of ownership, you can reach the poster via the in-app chat.</p>`)
    }).catch(() => {});
  }

  res.json(claim);
}));

module.exports = router;
