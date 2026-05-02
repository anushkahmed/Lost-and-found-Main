// routes/auth.js
//
// Hardened against:
//   • NoSQL operator injection (email/password coerced to strings)
//   • Account enumeration (forgot-password always returns 200)
//   • Online brute force (per-IP rate limiter + per-account lockout)
//   • Refresh token theft (rotation + tokenVersion-based revocation)
//   • Mass-assignment on register (explicit destructure; role can never be set)

const express   = require('express');
const router    = express.Router();
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const speakeasy = require('speakeasy');
const validator = require('validator');

const User      = require('../models/User');
const { sendEmail, wrap } = require('../utils/email');
const { decryptString } = require('../utils/crypto');
const { refreshSecret } = require('../utils/env');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validate');
const {
  registerBody,
  loginBody,
  twoFaLoginBody,
  forgotPasswordBody,
  resetPasswordBody,
} = require('../schemas/auth.schemas');
const {
  authLimiter,
  forgotPasswordLimiter,
} = require('../middleware/rateLimiters');
const { logSystemEvent } = require('./systemLogs');

const isProd = process.env.NODE_ENV === 'production';
const ACCESS_TTL  = process.env.ACCESS_TOKEN_TTL  || '15m';
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL || '7d';

// ─── Token helpers ───────────────────────────────────────────
const signAccess = (user) =>
  jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });

const signRefresh = (user) =>
  jwt.sign(
    { id: user._id.toString(), v: user.tokenVersion || 0 },
    refreshSecret(),
    { expiresIn: REFRESH_TTL }
  );

const sign2faTemp = (user) =>
  jwt.sign({ id: user._id.toString(), twofa: 'pending' }, process.env.JWT_SECRET, { expiresIn: '5m' });

function setRefreshCookie(res, token) {
  // Refresh token: httpOnly so JS can never read it; SameSite=Strict so it
  // never rides cross-site requests; Secure required in prod.
  res.cookie('findit_rt', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie('findit_rt', { path: '/api/auth' });
}

// Returned by login/refresh — minimal projection (never expose email by default
// here; it's already on the auth response, but we don't include hashes / lockout
// fields).
function publicUser(u) {
  return { _id: u._id, name: u.name, email: u.email, role: u.role };
}

// ─── Password policy ─────────────────────────────────────────
// OWASP-friendly: 10+ chars, has lowercase + uppercase + digit, optionally a symbol.
const COMMON_PASSWORDS = new Set([
  'password123','password1234','qwerty12345','letmein123','welcome123',
  'iloveyou123','admin1234','12345678910','passw0rd!','password!',
]);

function validatePassword(pw) {
  if (typeof pw !== 'string') return 'Password must be a string';
  if (pw.length < 10) return 'Password must be at least 10 characters';
  if (pw.length > 200) return 'Password is too long';
  if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter';
  if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter';
  if (!/[0-9]/.test(pw)) return 'Password must contain a number';
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'Password is too common — choose a stronger one';
  return null;
}

// Coerce identity to a primitive — kills the `{$ne: null}` injection trick.
function safeEmail(input) {
  if (typeof input !== 'string') return '';
  const e = input.trim().toLowerCase();
  if (!e || e.length > 254) return '';
  if (!validator.isEmail(e)) return '';
  return e;
}

// ─── POST /api/auth/register ──────────────────────────────────
router.post('/register', authLimiter, validate({ body: registerBody }), asyncHandler(async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = safeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const phone = typeof req.body.phone === 'string' ? req.body.phone.slice(0, 32) : '';

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, valid email and password are required' });
  }
  if (name.length > 80) return res.status(400).json({ message: 'Name is too long' });
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ message: pwErr });

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ message: 'Email already registered' });

  const user = await User.create({ name, email, password, phone });

  logSystemEvent({ action: 'user_registered', message: `New user registered: ${name} (${email})`, userId: user._id, ip: req.ip });

  const refreshToken = signRefresh(user);
  setRefreshCookie(res, refreshToken);
  return res.status(201).json({
    ...publicUser(user),
    token: signAccess(user),
  });
}));

// ─── POST /api/auth/login ─────────────────────────────────────
router.post('/login', authLimiter, validate({ body: loginBody }), asyncHandler(async (req, res) => {
  const email = safeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  // Need lockout/2FA fields and password hash — explicit select.
  const user = await User.findOne({ email })
    .select('+password +failedLoginAttempts +lockedUntil +twoFactorSecret');

  // Constant-time-ish: always do a bcrypt compare even when user is missing
  // so attackers can't time-side-channel valid emails.
  const dummyHash = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8.BLmF7YkIgX6h2uyL6dM9uqFdpV1G';
  if (!user) {
    const bcrypt = require('bcryptjs');
    await bcrypt.compare(password, dummyHash);
    return res.status(400).json({ message: 'Invalid email or password' });
  }

  if (user.isLocked()) {
    const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ message: `Account temporarily locked. Try again in ~${mins} minute(s).` });
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    // 5 strikes → 15 min lockout
    if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    if (user.lockedUntil) {
      logSystemEvent({ level: 'warn', action: 'account_locked', message: `Account locked due to failed attempts: ${email}`, userId: user._id, ip: req.ip });
    }
    return res.status(400).json({ message: 'Invalid email or password' });
  }

  if (user.active === false) {
    return res.status(403).json({ message: 'Account deactivated' });
  }

  // Successful credentials — clear lockout state
  if (user.failedLoginAttempts || user.lockedUntil) {
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();
  }

  // 2FA gate (intermediate token; not yet logged in)
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    return res.json({
      needsTwoFactor: true,
      twoFactorToken: sign2faTemp(user),
    });
  }

  logSystemEvent({ action: 'user_login', message: `User logged in: ${user.name}`, userId: user._id, ip: req.ip });

  setRefreshCookie(res, signRefresh(user));
  res.json({
    ...publicUser(user),
    token: signAccess(user),
  });
}));

// ─── POST /api/auth/2fa/login ─ second step ──────────────────
router.post('/2fa/login', authLimiter, validate({ body: twoFaLoginBody }), asyncHandler(async (req, res) => {
  const twoFactorToken = typeof req.body.twoFactorToken === 'string' ? req.body.twoFactorToken : '';
  const code = typeof req.body.code === 'string' ? req.body.code : '';
  if (!twoFactorToken || !code) {
    return res.status(400).json({ message: 'twoFactorToken and code are required' });
  }
  let payload;
  try {
    payload = jwt.verify(twoFactorToken, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Code expired — please log in again' });
  }
  if (payload.twofa !== 'pending') {
    return res.status(400).json({ message: 'Invalid two-factor token' });
  }

  const user = await User.findById(payload.id).select('+twoFactorSecret');
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return res.status(400).json({ message: '2FA not enabled' });
  }

  const decryptedSecret = decryptString(user.twoFactorSecret);
  const ok = speakeasy.totp.verify({
    secret: decryptedSecret,
    encoding: 'base32',
    token: code.replace(/\s+/g, ''),
    window: 1,
  });
  if (!ok) return res.status(400).json({ message: 'Invalid authentication code' });

  setRefreshCookie(res, signRefresh(user));
  res.json({
    ...publicUser(user),
    token: signAccess(user),
  });
}));

// ─── POST /api/auth/refresh ──────────────────────────────────
// Reads the refresh token from the httpOnly cookie, validates tokenVersion,
// rotates the refresh token, and returns a new short-lived access token.
router.post('/refresh', asyncHandler(async (req, res) => {
  const rt = req.cookies && req.cookies.findit_rt;
  if (!rt) return res.status(401).json({ message: 'No refresh token' });

  let payload;
  try {
    payload = jwt.verify(rt, refreshSecret());
  } catch {
    clearRefreshCookie(res);
    return res.status(401).json({ message: 'Invalid refresh token' });
  }

  const user = await User.findById(payload.id).select('+tokenVersion');
  if (!user || user.active === false) {
    clearRefreshCookie(res);
    return res.status(401).json({ message: 'Session no longer valid' });
  }
  if ((payload.v || 0) !== (user.tokenVersion || 0)) {
    // tokenVersion bumped on logout / forced reauth — invalidate
    clearRefreshCookie(res);
    return res.status(401).json({ message: 'Session no longer valid' });
  }

  setRefreshCookie(res, signRefresh(user)); // rotate
  res.json({ token: signAccess(user), ...publicUser(user) });
}));

// ─── POST /api/auth/logout ──────────────────────────────────
router.post('/logout', protect, asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } });
  clearRefreshCookie(res);
  res.json({ message: 'Logged out' });
}));

// ─── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', protect, asyncHandler(async (req, res) => {
  res.json(publicUser(req.user));
}));

// ─── POST /api/auth/make-admin ────────────────────────────────
// Hard-gated: requires both ALLOW_ADMIN_BOOTSTRAP=true and a matching ADMIN_SECRET.
router.post('/make-admin', authLimiter, asyncHandler(async (req, res) => {
  if (process.env.ALLOW_ADMIN_BOOTSTRAP !== 'true') {
    return res.status(404).json({ message: 'Not found' });
  }
  const secret = typeof req.body.adminSecret === 'string' ? req.body.adminSecret : '';
  const email = safeEmail(req.body.email);
  if (!process.env.ADMIN_SECRET || secret.length === 0) {
    return res.status(403).json({ message: 'Wrong admin secret' });
  }
  // constant-time compare
  const a = Buffer.from(secret);
  const b = Buffer.from(process.env.ADMIN_SECRET);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ message: 'Wrong admin secret' });
  }
  if (!email) return res.status(400).json({ message: 'Valid email required' });

  const user = await User.findOneAndUpdate({ email }, { $set: { role: 'admin' } }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ message: `${user.name} is now an admin`, role: user.role });
}));

// ─── POST /api/auth/forgot-password ──────────────────────────
router.post('/forgot-password', forgotPasswordLimiter, validate({ body: forgotPasswordBody }), asyncHandler(async (req, res) => {
  const email = safeEmail(req.body.email);
  // Generic response always — no enumeration.
  const generic = { message: 'If an account exists, a reset link has been sent.' };
  if (!email) return res.json(generic);

  const user = await User.findOne({ email });
  if (!user) return res.json(generic);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashed   = crypto.createHash('sha256').update(rawToken).digest('hex');

  user.passwordResetToken   = hashed;
  user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
  await user.save();

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

  const safeName = (user.name || 'there').replace(/[<>]/g, '');
  const result = await sendEmail({
    to: user.email,
    subject: 'Reset your FindIt password',
    html: wrap('Password reset',
      `<p>Hi ${safeName},</p>
       <p>Click the link below to reset your FindIt password. The link expires in 30 minutes.</p>
       <p><a href="${resetUrl}" style="background:#4a7c6f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Reset password</a></p>
       <p style="color:#94a3b8;font-size:12px;margin-top:14px">If you didn't request this, you can safely ignore this email.</p>`)
  });

  if (result.skipped && !isProd) {
    // Dev-only fallback — never leak a reset link in production.
    return res.json({ ...generic, devResetUrl: resetUrl });
  }
  res.json(generic);
}));

// ─── POST /api/auth/reset-password ──────────────────────────
router.post('/reset-password', authLimiter, validate({ body: resetPasswordBody }), asyncHandler(async (req, res) => {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  const email = safeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!token || !email || !password) {
    return res.status(400).json({ message: 'token, email and password are required' });
  }
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ message: pwErr });

  const hashed = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    email,
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() }
  }).select('+passwordResetToken +passwordResetExpires +tokenVersion');
  if (!user) return res.status(400).json({ message: 'Invalid or expired reset link' });

  user.password = password; // pre-save hook hashes
  user.passwordResetToken   = '';
  user.passwordResetExpires = null;
  user.failedLoginAttempts  = 0;
  user.lockedUntil          = null;
  user.tokenVersion         = (user.tokenVersion || 0) + 1; // invalidate ALL sessions
  await user.save();

  logSystemEvent({ action: 'password_reset', message: `Password reset completed for: ${user.email}`, userId: user._id, ip: req.ip });

  res.json({ message: 'Password updated. You can now log in.' });
}));

// ─── POST /api/auth/first-admin ──────────────────────────────
// Only valid when ALLOW_ADMIN_BOOTSTRAP=true AND there is exactly one user.
router.post('/first-admin', authLimiter, asyncHandler(async (req, res) => {
  if (process.env.ALLOW_ADMIN_BOOTSTRAP !== 'true') {
    return res.status(404).json({ message: 'Not found' });
  }
  const userCount = await User.countDocuments();
  if (userCount !== 1) {
    return res.status(400).json({ message: 'first-admin only available with exactly one registered user.' });
  }
  const user = await User.findOneAndUpdate({}, { $set: { role: 'admin' } }, { new: true });
  if (!user) return res.status(404).json({ message: 'No users found' });
  res.json({ message: `${user.name} is now the first admin!` });
}));

module.exports = router;
