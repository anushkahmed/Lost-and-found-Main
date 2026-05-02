// routes/notifications.js — Feature 4: Notification Alerts
const express = require('express');
const router  = express.Router();
const { Notification } = require('../models/OtherModels');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { requireObjectId, parsePagination } = require('../middleware/security');

// GET /api/notifications — get my notifications (paginated, hard-capped)
router.get('/', protect, asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req, { defaultLimit: 50, maxLimit: 100 });
  const total = await Notification.countDocuments({ userId: req.user._id });
  const notifications = await Notification.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  res.json({ notifications, total, page, pages: Math.ceil(total / limit) });
}));

// PUT /api/notifications/read-all — must stay above /:id routes
router.put('/read-all', protect, asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
  res.json({ message: 'All marked as read' });
}));

router.delete('/clear-all', protect, asyncHandler(async (req, res) => {
  await Notification.deleteMany({ userId: req.user._id });
  res.json({ message: 'All notifications cleared' });
}));

router.put('/:id/read', protect, requireObjectId('id'), asyncHandler(async (req, res) => {
  const notif = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
  if (!notif) return res.status(404).json({ message: 'Notification not found' });
  notif.read = true;
  await notif.save();
  res.json({ message: 'Marked as read' });
}));

router.delete('/:id', protect, requireObjectId('id'), asyncHandler(async (req, res) => {
  const notif = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!notif) return res.status(404).json({ message: 'Notification not found' });
  res.json({ message: 'Deleted' });
}));

module.exports = router;
