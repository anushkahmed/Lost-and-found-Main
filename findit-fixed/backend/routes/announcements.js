// routes/announcements.js — Feature 5: Announcements & Broadcasting
//
// Hardening:
//   • Length limits on title/body (200 / 5000 chars).
//   • All interpolated values into the urgent-email blast are HTML-escaped.
//   • requireObjectId on PUT/DELETE :id.
//   • Pagination capped.
//   • Recipient list `.lean()` to keep memory predictable.

const express = require('express');
const router  = express.Router();
const { Announcement, Notification } = require('../models/OtherModels');
const User = require('../models/User');
const { sendEmail, wrap } = require('../utils/email');
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { requireObjectId, parsePagination } = require('../middleware/security');

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const MAX_TITLE = 200;
const MAX_BODY  = 5000;

// GET /api/announcements — paginated, public
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req, { defaultLimit: 20, maxLimit: 50 });
  const total = await Announcement.countDocuments();
  const announcements = await Announcement.find()
    .populate('postedBy', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  res.json({ announcements, total, page, pages: Math.ceil(total / limit) });
}));

// POST /api/announcements — admin only
router.post('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const title = (typeof req.body.title === 'string' ? req.body.title.trim() : '').slice(0, MAX_TITLE);
  const body  = (typeof req.body.body  === 'string' ? req.body.body.trim()  : '').slice(0, MAX_BODY);
  const priority = ['normal','urgent'].includes(req.body.priority) ? req.body.priority : 'normal';
  const audience = typeof req.body.audience === 'string' ? req.body.audience.slice(0, 60) : '';
  if (!title || !body) return res.status(400).json({ message: 'title and body are required' });

  const announcement = await Announcement.create({
    title, body, priority, audience, postedBy: req.user._id
  });

  const allUsers = await User.find({}, '_id').lean();
  const notifDocs = allUsers.map(u => ({
    userId: u._id, type: 'announcement',
    title: `📢 ${title}`, message: body, read: false,
  }));
  await Notification.insertMany(notifDocs);

  req.io.emit('announcement:new', { title, message: body, priority, id: announcement._id });

  if (priority === 'urgent') {
    const recipients = await User.find({ active: { $ne: false } }, 'email name').lean();
    const safeBody  = escapeHtml(body).replace(/\n/g, '<br/>');
    const safeTitle = escapeHtml(title);
    const html = wrap(`📢 ${safeTitle}`,
      `<p>${safeBody}</p>
       <p style="color:#94a3b8;font-size:12px;margin-top:14px">— FindIt Admin Team</p>`);
    Promise.all(recipients.map(u =>
      sendEmail({ to: u.email, subject: `[Urgent] ${title}`, html })
    )).catch(() => {});
  }

  res.status(201).json(announcement);
}));

// PUT /api/announcements/:id — admin edit
router.put('/:id', protect, adminOnly, requireObjectId('id'), asyncHandler(async (req, res) => {
  const updates = {};
  if (typeof req.body.title === 'string') updates.title = req.body.title.trim().slice(0, MAX_TITLE);
  if (typeof req.body.body  === 'string') updates.body  = req.body.body.trim().slice(0, MAX_BODY);
  if (['normal','urgent'].includes(req.body.priority)) updates.priority = req.body.priority;
  if (typeof req.body.audience === 'string') updates.audience = req.body.audience.slice(0, 60);
  if (!Object.keys(updates).length) return res.status(400).json({ message: 'Nothing to update' });

  const updated = await Announcement.findByIdAndUpdate(req.params.id, updates,
    { new: true, runValidators: true });
  if (!updated) return res.status(404).json({ message: 'Announcement not found' });
  res.json(updated);
}));

// DELETE /api/announcements/:id — admin only
router.delete('/:id', protect, adminOnly, requireObjectId('id'), asyncHandler(async (req, res) => {
  const deleted = await Announcement.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Announcement not found' });
  res.json({ message: 'Deleted' });
}));

module.exports = router;
