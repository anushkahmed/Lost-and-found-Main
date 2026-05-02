// routes/twofa.js — TOTP enrollment & verification.
//
// The TOTP secret is stored encrypted at rest (AES-256-GCM via utils/crypto.js)
// so a database breach by itself does NOT compromise users' second factors.

const express   = require('express');
const router    = express.Router();
const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');

const User      = require('../models/User');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { encryptString, decryptString } = require('../utils/crypto');
const { authLimiter } = require('../middleware/rateLimiters');

const APP_NAME = 'FindIt Lost & Found';

// POST /api/2fa/setup — generate secret + QR (does NOT enable yet)
router.post('/setup', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+twoFactorSecret');
  if (!user) return res.status(404).json({ message: 'User not found' });

  const secret = speakeasy.generateSecret({
    name: `${APP_NAME} (${user.email})`,
    length: 20,
  });

  user.twoFactorSecret  = encryptString(secret.base32); // encrypted at rest
  user.twoFactorEnabled = false;
  await user.save();

  const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
  res.json({
    message: 'Scan the QR with Google Authenticator / Authy and submit a code to enable.',
    otpauthUrl: secret.otpauth_url,
    base32: secret.base32, // shown ONCE — never persisted unencrypted server-side
    qr: qrDataUrl,
  });
}));

// POST /api/2fa/verify — confirm a token, enable 2FA
router.post('/verify', protect, authLimiter, asyncHandler(async (req, res) => {
  const code = typeof req.body.code === 'string' ? req.body.code : '';
  if (!code) return res.status(400).json({ message: 'code is required' });

  const user = await User.findById(req.user._id).select('+twoFactorSecret');
  if (!user || !user.twoFactorSecret) {
    return res.status(400).json({ message: 'Run /2fa/setup first' });
  }

  const decryptedSecret = decryptString(user.twoFactorSecret);
  const ok = speakeasy.totp.verify({
    secret: decryptedSecret,
    encoding: 'base32',
    token: code.replace(/\s+/g, ''),
    window: 1,
  });
  if (!ok) return res.status(400).json({ message: 'Invalid code — try again' });

  user.twoFactorEnabled = true;
  await user.save();
  res.json({ message: '2FA enabled', twoFactorEnabled: true });
}));

// POST /api/2fa/disable — turn off (requires current password)
router.post('/disable', protect, authLimiter, asyncHandler(async (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!password) return res.status(400).json({ message: 'password is required to disable 2FA' });

  const user = await User.findById(req.user._id).select('+password');
  if (!user) return res.status(404).json({ message: 'User not found' });

  const ok = await user.matchPassword(password);
  if (!ok) return res.status(400).json({ message: 'Invalid password' });

  user.twoFactorEnabled = false;
  user.twoFactorSecret  = '';
  await user.save();
  res.json({ message: '2FA disabled', twoFactorEnabled: false });
}));

// GET /api/2fa/status — convenience for the UI
router.get('/status', protect, asyncHandler(async (req, res) => {
  const u = await User.findById(req.user._id).select('twoFactorEnabled');
  res.json({ twoFactorEnabled: !!u?.twoFactorEnabled });
}));

module.exports = router;
