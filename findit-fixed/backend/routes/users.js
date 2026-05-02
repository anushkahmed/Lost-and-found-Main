// routes/users.js — profile + admin user management.
//
// • Mass-assignment protection: explicit field whitelist for self-update.
// • Avatar uploads use the hardened multer factory + magic-byte verification.
// • Search regex is escaped before Mongo to prevent ReDoS.
// • Pagination is hard-capped.

const express = require('express');
const router = express.Router();
const path = require('path');

const User = require('../models/User');
const Item = require('../models/Item');
const { Claim } = require('../models/OtherModels');
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { requireObjectId, parsePagination } = require('../middleware/security');
const { uploadLimiter } = require('../middleware/rateLimiters');
const { makeImageUpload, verifyMagicBytesMiddleware } = require('../utils/upload');

const uploadAvatar = makeImageUpload('avatars', { maxBytes: 3 * 1024 * 1024 });

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/users/me/full — own profile + counts
router.get('/me/full', protect, asyncHandler(async (req, res) => {
  const itemsPosted = await Item.countDocuments({ postedBy: req.user._id });
  const claimsMade = await Claim.countDocuments({ claimantId: req.user._id });
  res.json({ user: req.user, stats: { itemsPosted, claimsMade } });
}));

// PUT /api/users/me — update profile (mass-assignment safe)
router.put('/me', protect, asyncHandler(async (req, res) => {
  const updates = {};
  if (typeof req.body.name === 'string') updates.name = req.body.name.trim().slice(0, 80);
  if (typeof req.body.phone === 'string') updates.phone = req.body.phone.trim().slice(0, 32);
  if (!Object.keys(updates).length) {
    return res.status(400).json({ message: 'Nothing to update' });
  }
  const updated = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
  res.json(updated);
}));

// POST /api/users/me/avatar — upload avatar (magic-byte verified)
router.post(
  '/me/avatar',
  protect,
  uploadLimiter,
  uploadAvatar.single('avatar'),
  verifyMagicBytesMiddleware,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'avatar file is required' });
    const avatarPath = req.file.path.split(path.sep).join('/');
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { profilePicture: avatarPath },
      { new: true }
    );
    res.json({ user: updated, profilePicture: avatarPath });
  })
);

// POST /api/users/me/deactivate — deactivate own account
router.post('/me/deactivate', protect, asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    active: false,
    deactivatedAt: new Date(),
    $inc: { tokenVersion: 1 }, // invalidate all sessions
  });
  res.json({ message: 'Account deactivated' });
}));

// ─── Admin endpoints ───────────────────────────────────────────

// GET /api/users — admin list users
router.get('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : '';
  const role = req.query.role === 'admin' || req.query.role === 'user' ? req.query.role : '';
  const activeStr = req.query.active;

  const query = {};
  if (role) query.role = role;
  if (activeStr === 'true' || activeStr === 'false') query.active = activeStr === 'true';
  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { name:  { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } }
    ];
  }
  const total = await User.countDocuments(query);
  const users = await User.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  res.json({ users, total, page, pages: Math.ceil(total / limit) });
}));

// PUT /api/users/:id/role — admin change role
router.put('/:id/role', protect, adminOnly, requireObjectId('id'), asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'role must be user or admin' });
  }
  if (req.params.id === req.user._id.toString() && role !== 'admin') {
    return res.status(400).json({ message: 'Cannot demote yourself' });
  }
  const updated = await User.findByIdAndUpdate(
    req.params.id,
    { role, $inc: { tokenVersion: 1 } }, // role change → invalidate user's sessions
    { new: true }
  );
  if (!updated) return res.status(404).json({ message: 'User not found' });
  res.json(updated);
}));

// PUT /api/users/:id/status — admin activate/deactivate
router.put('/:id/status', protect, adminOnly, requireObjectId('id'), asyncHandler(async (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') {
    return res.status(400).json({ message: 'active must be boolean' });
  }
  if (req.params.id === req.user._id.toString() && !active) {
    return res.status(400).json({ message: 'Cannot deactivate yourself' });
  }
  const updated = await User.findByIdAndUpdate(
    req.params.id,
    { active, deactivatedAt: active ? null : new Date(), $inc: { tokenVersion: 1 } },
    { new: true }
  );
  if (!updated) return res.status(404).json({ message: 'User not found' });
  res.json(updated);
}));

// PUT /api/users/:id/verify — admin toggle verified badge
router.put('/:id/verify', protect, adminOnly, requireObjectId('id'), asyncHandler(async (req, res) => {
  const { verifiedBadge } = req.body;
  if (typeof verifiedBadge !== 'boolean') {
    return res.status(400).json({ message: 'verifiedBadge must be boolean' });
  }
  const updated = await User.findByIdAndUpdate(req.params.id, { verifiedBadge }, { new: true });
  if (!updated) return res.status(404).json({ message: 'User not found' });
  res.json(updated);
}));

module.exports = router;
