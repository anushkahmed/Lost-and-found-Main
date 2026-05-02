// middleware/rateLimiters.js — express-rate-limit instances for hot paths.
//
// IP-level limits stop credential stuffing, password-reset flooding, OTP
// guessing, and abuse-report spam. Account-level lockout (5 failed logins =
// 15 min) lives on the User model itself so a botnet can't bypass it by
// rotating IPs.

const rateLimit = require('express-rate-limit');

const isProd = process.env.NODE_ENV === 'production';

// Slightly relaxed in dev so we don't get stuck on hot reload bursts.
const window = (mins) => mins * 60 * 1000;

const standardOpts = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Use real client ip (req.ip) which respects `app.set('trust proxy', ...)`
  keyGenerator: (req) => req.ip,
  message: { message: 'Too many requests — please slow down and try again later.' },
};

// 10 / 15 min: login, register, 2FA verification, password reset request/consume.
const authLimiter = rateLimit({
  ...standardOpts,
  windowMs: window(15),
  max: isProd ? 10 : 100,
});

// 30 / 15 min: forgot-password specifically (a bit higher because typo retries are normal,
// but combined with random-token generation cost this is fine).
const forgotPasswordLimiter = rateLimit({
  ...standardOpts,
  windowMs: window(15),
  max: isProd ? 5 : 50,
});

// 20 / hour: file upload bursts on item posting + chat attachments.
const uploadLimiter = rateLimit({
  ...standardOpts,
  windowMs: window(60),
  max: isProd ? 30 : 300,
});

// 300 / 15 min global per-IP cap. Real users won't hit this.
const apiLimiter = rateLimit({
  ...standardOpts,
  windowMs: window(15),
  max: isProd ? 300 : 3000,
});

// 10 / hour per IP for abuse reports (so a single user can't spam dozens).
const abuseLimiter = rateLimit({
  ...standardOpts,
  windowMs: window(60),
  max: isProd ? 10 : 100,
});

module.exports = {
  authLimiter,
  forgotPasswordLimiter,
  uploadLimiter,
  apiLimiter,
  abuseLimiter,
};
