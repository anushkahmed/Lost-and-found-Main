// routes/feedback.js — User feedback / rating system
// Users can rate each other after an item is returned (positive feedback)

const express = require('express');
const router  = express.Router();
const { Feedback } = require('../models/Phase2Models');
const Item = require('../models/Item');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { requireObjectId, isObjectId } = require('../middleware/security');

// POST /api/feedback — submit feedback for a user after item return
router.post('/', protect, asyncHandler(async (req, res) => {
  const { itemId, toUser, rating, comment, type } = req.body;

  if (!isObjectId(itemId)) return res.status(400).json({ message: 'Valid itemId required' });
  if (!isObjectId(toUser)) return res.status(400).json({ message: 'Valid toUser required' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be 1-5' });
  }
  if (!['finder', 'claimer'].includes(type)) {
    return res.status(400).json({ message: 'type must be finder or claimer' });
  }

  if (toUser === req.user._id.toString()) {
    return res.status(400).json({ message: 'Cannot rate yourself' });
  }

  // Verify item exists and is returned
  const item = await Item.findById(itemId);
  if (!item) return res.status(404).json({ message: 'Item not found' });
  if (item.status !== 'returned') {
    return res.status(400).json({ message: 'Feedback can only be given for returned items' });
  }

  // Verify the caller is involved with this item (poster or approved claimer)
  const isInvolved = item.postedBy.toString() === req.user._id.toString() ||
    toUser === item.postedBy.toString();
  if (!isInvolved) {
    return res.status(403).json({ message: 'You are not involved with this item' });
  }

  // Check for duplicate
  const existing = await Feedback.findOne({ fromUser: req.user._id, itemId });
  if (existing) {
    return res.status(409).json({ message: 'You already gave feedback for this item' });
  }

  const cleanComment = (typeof comment === 'string' ? comment.trim() : '').slice(0, 500);

  const feedback = await Feedback.create({
    fromUser: req.user._id,
    toUser,
    itemId,
    rating,
    comment: cleanComment,
    type
  });

  // Positive feedback boosts trust score slightly
  if (rating >= 4) {
    await User.findByIdAndUpdate(toUser, { $inc: { trustScore: 2, points: 5 } });
    // Clamp
    const u = await User.findById(toUser).select('trustScore');
    if (u && u.trustScore > 100) {
      await User.findByIdAndUpdate(toUser, { trustScore: 100 });
    }
  }

  res.status(201).json(feedback);
}));

// GET /api/feedback/user/:id — get feedback for a user
router.get('/user/:id', protect, requireObjectId('id'), asyncHandler(async (req, res) => {
  const feedbacks = await Feedback.find({ toUser: req.params.id })
    .populate('fromUser', 'name profilePicture verifiedBadge')
    .populate('itemId', 'name category')
    .sort({ createdAt: -1 })
    .limit(50);

  // Calculate average rating
  const total = feedbacks.length;
  const avgRating = total > 0
    ? Math.round((feedbacks.reduce((sum, f) => sum + f.rating, 0) / total) * 10) / 10
    : 0;

  res.json({ feedbacks, total, avgRating });
}));

// GET /api/feedback/item/:id — get feedback for a specific item
router.get('/item/:id', protect, requireObjectId('id'), asyncHandler(async (req, res) => {
  const feedbacks = await Feedback.find({ itemId: req.params.id })
    .populate('fromUser', 'name profilePicture')
    .populate('toUser', 'name profilePicture')
    .sort({ createdAt: -1 });
  res.json(feedbacks);
}));

// GET /api/feedback/check/:itemId — check if current user already gave feedback
router.get('/check/:itemId', protect, requireObjectId('itemId'), asyncHandler(async (req, res) => {
  const existing = await Feedback.findOne({ fromUser: req.user._id, itemId: req.params.itemId });
  res.json({ given: !!existing, feedback: existing });
}));

module.exports = router;
