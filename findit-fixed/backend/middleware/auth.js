// middleware/auth.js
//
// `protect` accepts the access token from EITHER:
//   • Authorization: Bearer <token>     (legacy + API clients)
//   • findit_at cookie                   (Phase B web client)
//
// On Phase B the frontend stops storing the access token in localStorage and
// keeps it in JS memory only (or in a short-lived cookie). Either way the same
// middleware handles both.

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

function extractAccessToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  if (req.cookies && typeof req.cookies.findit_at === 'string') return req.cookies.findit_at;
  return null;
}

const protect = async (req, res, next) => {
  const token = extractAccessToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }

  // Reject any 2FA-pending intermediate token from being used as full auth.
  if (decoded && decoded.twofa === 'pending') {
    return res.status(401).json({ message: 'Two-factor authentication is required' });
  }

  try {
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: 'Not authorized, user no longer exists' });
    if (user.active === false) return res.status(403).json({ message: 'Account is deactivated' });

    req.user = user;
    return next();
  } catch (err) {
    logger.error({ err: err.message }, 'auth_middleware_failed');
    return res.status(500).json({ message: 'Authentication error' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ message: 'Admin access only' });
};

// Optional: useful when you want to use a route both anonymously and
// (preferentially) authenticated. Doesn't 401 if no token; just leaves req.user
// undefined.
const optionalAuth = async (req, res, next) => {
  const token = extractAccessToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded && decoded.twofa !== 'pending') {
      const user = await User.findById(decoded.id);
      if (user && user.active !== false) req.user = user;
    }
  } catch { /* ignore — anonymous */ }
  next();
};

module.exports = { protect, adminOnly, optionalAuth, extractAccessToken };
