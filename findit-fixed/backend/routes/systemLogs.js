// routes/systemLogs.js — Admin system logs monitoring
// Logs key system events to DB for admin viewing

const express = require('express');
const router  = express.Router();
const { SystemLog } = require('../models/Phase2Models');
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { parsePagination } = require('../middleware/security');

// GET /api/admin/logs — admin view system logs
router.get('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req, { defaultLimit: 50, maxLimit: 100 });
  const level = typeof req.query.level === 'string' ? req.query.level : '';
  const action = typeof req.query.action === 'string' ? req.query.action : '';

  const query = {};
  if (['info', 'warn', 'error'].includes(level)) query.level = level;
  if (action) query.action = { $regex: action, $options: 'i' };

  const total = await SystemLog.countDocuments(query);
  const logs = await SystemLog.find(query)
    .populate('userId', 'name email role')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({ logs, total, page, pages: Math.ceil(total / limit) });
}));

// GET /api/admin/logs/summary — quick log stats
router.get('/summary', protect, adminOnly, asyncHandler(async (req, res) => {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [total, errors24h, warns24h, info24h, total7d] = await Promise.all([
    SystemLog.countDocuments({}),
    SystemLog.countDocuments({ level: 'error', createdAt: { $gte: last24h } }),
    SystemLog.countDocuments({ level: 'warn', createdAt: { $gte: last24h } }),
    SystemLog.countDocuments({ level: 'info', createdAt: { $gte: last24h } }),
    SystemLog.countDocuments({ createdAt: { $gte: last7d } }),
  ]);

  res.json({ total, last24h: { errors: errors24h, warnings: warns24h, info: info24h }, total7d });
}));

// DELETE /api/admin/logs/clear — admin clear old logs (older than 30 days)
router.delete('/clear', protect, adminOnly, asyncHandler(async (req, res) => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await SystemLog.deleteMany({ createdAt: { $lt: cutoff } });
  res.json({ message: `Cleared ${result.deletedCount} old log entries` });
}));

module.exports = router;

// Helper — call from any route to log a system event
module.exports.logSystemEvent = async function logSystemEvent({ level = 'info', action, message, userId = null, meta = {}, ip = '' }) {
  try {
    await SystemLog.create({ level, action, message, userId, meta, ip });
  } catch (e) {
    console.error('SystemLog write failed:', e.message);
  }
};
