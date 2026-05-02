// routes/backups.js — Admin backup management
const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { runBackup, listBackups } = require('../cron/backup');

// GET /api/admin/backups — list all backups
router.get('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const backups = listBackups();
  res.json(backups);
}));

// POST /api/admin/backups/trigger — manually trigger a backup
router.post('/trigger', protect, adminOnly, asyncHandler(async (req, res) => {
  const result = await runBackup();
  if (result.success) {
    res.json({ message: `Backup completed successfully: ${result.name}`, backup: result });
  } else {
    res.status(500).json({
      message: `Backup failed: ${result.error}`,
      note: 'Ensure MongoDB Database Tools (mongodump) are installed, or use MongoDB Atlas Cloud Backup.',
      backup: result
    });
  }
}));

module.exports = router;
