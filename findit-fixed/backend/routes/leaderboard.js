// routes/leaderboard.js — Phase 3: Public reputation leaderboard
const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const { protect } = require('../middleware/auth');

// GET /api/leaderboard?metric=points|trust&limit=20
router.get('/', protect, async (req, res) => {
  try {
    const metric = (req.query.metric || 'points').toLowerCase();
    const limit  = Math.min(50, Math.max(5, Number(req.query.limit) || 20));
    const sortKey = metric === 'trust' ? 'trustScore' : 'points';

    const users = await User.find({ active: { $ne: false } })
      .select('name email role trustScore points verifiedBadge profilePicture createdAt')
      .sort({ [sortKey]: -1, createdAt: 1 })
      .limit(limit);

    // Find caller's rank within the same metric
    const me = await User.findById(req.user._id).select(`name ${sortKey} verifiedBadge`);
    const myRank = me
      ? (await User.countDocuments({ active: { $ne: false }, [sortKey]: { $gt: me[sortKey] || 0 } })) + 1
      : null;

    res.json({
      metric,
      users: users.map((u, i) => ({
        rank: i + 1,
        _id: u._id,
        name: u.name,
        role: u.role,
        verifiedBadge: u.verifiedBadge,
        profilePicture: u.profilePicture,
        score: u[sortKey],
        // hide raw email for non-admins
        ...(req.user.role === 'admin' ? { email: u.email } : {}),
      })),
      me: me ? { rank: myRank, score: me[sortKey] || 0, name: me.name, verifiedBadge: me.verifiedBadge } : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
