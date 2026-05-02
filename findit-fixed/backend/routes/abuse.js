// routes/abuse.js — Phase 2: Report Abuse / Fake Listings
//
// Hardening:
//   • abuseLimiter caps abuse-report submissions (10/h per IP).
//   • All ObjectId targets are validated before DB lookups.
//   • Admin-only on list & resolve.

const express = require('express');
const router  = express.Router();
const { AbuseReport } = require('../models/Phase2Models');
const { Notification } = require('../models/OtherModels');
const Item    = require('../models/Item');
const User    = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { abuseLimiter } = require('../middleware/rateLimiters');
const { isObjectId, requireObjectId } = require('../middleware/security');

const REASONS = ['fake', 'scam', 'inappropriate', 'spam', 'other'];

router.post('/', protect, abuseLimiter, asyncHandler(async (req, res) => {
  const targetType = req.body.targetType;
  const reason = req.body.reason;
  const details = (typeof req.body.details === 'string' ? req.body.details : '').slice(0, 1000);

  if (!['item', 'user'].includes(targetType)) {
    return res.status(400).json({ message: 'targetType must be item or user' });
  }
  if (!reason || !REASONS.includes(reason)) {
    return res.status(400).json({ message: `reason must be one of: ${REASONS.join(', ')}` });
  }

  const payload = {
    reporterId: req.user._id,
    targetType, reason, details,
  };

  if (targetType === 'item') {
    if (!isObjectId(req.body.targetItemId)) return res.status(400).json({ message: 'Valid targetItemId required' });
    const item = await Item.findById(req.body.targetItemId);
    if (!item) return res.status(404).json({ message: 'Target item not found' });
    payload.targetItemId = item._id;
  } else {
    if (!isObjectId(req.body.targetUserId)) return res.status(400).json({ message: 'Valid targetUserId required' });
    const user = await User.findById(req.body.targetUserId);
    if (!user) return res.status(404).json({ message: 'Target user not found' });
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }
    payload.targetUserId = user._id;
  }

  const report = await AbuseReport.create(payload);

  const admins = await User.find({ role: 'admin' }, '_id');
  const title = targetType === 'item' ? 'New abuse report on listing' : 'New abuse report on user';
  const msg = `Reason: ${reason}${details ? ` — ${details.slice(0, 100)}` : ''}`;
  await Notification.insertMany(
    admins.map(a => ({
      userId: a._id, type: 'abuse', title, message: msg,
      itemId: payload.targetItemId || null, read: false
    }))
  );
  admins.forEach(a => req.io.to(a._id.toString()).emit('abuse:new', { reportId: report._id, reason }));

  res.status(201).json(report);
}));

router.get('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'open';
  const allowed = ['open', 'resolved', 'dismissed', 'all'];
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status filter' });
  const query = status === 'all' ? {} : { status };
  const reports = await AbuseReport.find(query)
    .populate('reporterId', 'name email')
    .populate('targetItemId', 'name images status postedBy')
    .populate('targetUserId', 'name email role active')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(reports);
}));

router.put('/:id', protect, adminOnly, requireObjectId('id'), asyncHandler(async (req, res) => {
  const status = req.body.status;
  const resolutionNote = (typeof req.body.resolutionNote === 'string' ? req.body.resolutionNote : '').slice(0, 500);
  if (!['resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ message: 'status must be resolved or dismissed' });
  }
  const report = await AbuseReport.findByIdAndUpdate(
    req.params.id,
    { status, resolutionNote, resolvedBy: req.user._id },
    { new: true }
  );
  if (!report) return res.status(404).json({ message: 'Report not found' });
  res.json(report);
}));

module.exports = router;
