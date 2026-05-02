// cron/backup.js — Automated database backup using mongodump
// Runs weekly at 03:00 on Sunday, or can be triggered manually via the API.
// Backups are stored in backend/backups/ directory.

const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function getBackupName() {
  const d = new Date();
  return `backup_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

function runBackup() {
  return new Promise((resolve, reject) => {
    ensureBackupDir();
    const backupName = getBackupName();
    const outDir = path.join(BACKUP_DIR, backupName);
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/findit';

    // Try mongodump; if not available, fall back to a JSON export approach
    const cmd = `mongodump --uri="${mongoUri}" --out="${outDir}" --gzip`;

    exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        // If mongodump is not installed, create a marker file documenting the attempt
        const fallbackPath = path.join(BACKUP_DIR, `${backupName}_status.json`);
        const status = {
          name: backupName,
          date: new Date().toISOString(),
          status: 'failed',
          error: error.message,
          note: 'mongodump not available. Install MongoDB Database Tools for automated backups, or use MongoDB Atlas Cloud Backup.',
        };
        fs.writeFileSync(fallbackPath, JSON.stringify(status, null, 2));
        return resolve({ success: false, name: backupName, error: error.message });
      }
      // Write success marker
      const statusPath = path.join(BACKUP_DIR, `${backupName}_status.json`);
      const status = {
        name: backupName,
        date: new Date().toISOString(),
        status: 'success',
        path: outDir,
        compressed: true,
      };
      fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
      resolve({ success: true, name: backupName, path: outDir });
    });
  });
}

function listBackups() {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('_status.json'));
  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), 'utf-8'));
    } catch {
      return { name: f, status: 'unknown' };
    }
  }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

module.exports = function startBackupCron(io) {
  // Run weekly at 03:00 on Sunday
  cron.schedule('0 3 * * 0', async () => {
    try {
      const result = await runBackup();
      console.log(`🗄️ Backup cron: ${result.success ? 'SUCCESS' : 'FAILED'} — ${result.name}`);

      // Notify admins
      const User = require('../models/User');
      const admins = await User.find({ role: 'admin' }, '_id');
      admins.forEach(a => {
        io.to(a._id.toString()).emit('system:backup', {
          message: result.success ? `Backup completed: ${result.name}` : `Backup failed: ${result.error}`,
          success: result.success
        });
      });
    } catch (err) {
      console.error('🗄️ Backup cron error:', err.message);
    }
  });
};

module.exports.runBackup = runBackup;
module.exports.listBackups = listBackups;
