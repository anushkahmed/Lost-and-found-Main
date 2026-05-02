// middleware/security.js — small composable safety guards reused everywhere.
//
//   isObjectId(s)       → boolean   (validates Mongo ObjectId format)
//   requireObjectId('id', 'params') → middleware that 400's on bad id
//   parsePagination(req)            → { page, limit, skip }
//   apiError(status, msg)           → typed error for the handler
//   notFound, errorHandler          → mount in server.js

const mongoose = require('mongoose');
const logger = require('../utils/logger');

const isProd = process.env.NODE_ENV === 'production';

// ── Optional monitor hook ───────────────────────────────────────
// We DO NOT pull in @sentry/node by default — adding the SDK doubles cold-
// start time on Render's free tier. If you want Sentry, set SENTRY_DSN and
// require the SDK manually here. The shape below means errorHandler will
// call captureException(err) for every 5xx without us having to remember.
let captureException = () => {};
if (process.env.SENTRY_DSN) {
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    const Sentry = require('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
    captureException = (err, ctx) => Sentry.captureException(err, { extra: ctx });
    logger.info('sentry_initialized');
  } catch (e) {
    logger.warn({ err: e.message }, 'sentry_dsn_set_but_sdk_missing');
  }
}

const isObjectId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);

function requireObjectId(field, location = 'params') {
  return (req, res, next) => {
    const value = req[location]?.[field];
    if (!isObjectId(value)) {
      return res.status(400).json({ message: `Invalid id in request ${location}.${field}` });
    }
    next();
  };
}

// Hard-cap pagination so an attacker can't request `?limit=999999` and DoS us.
function parsePagination(req, { defaultLimit = 20, maxLimit = 50 } = {}) {
  let page = Number.parseInt(req.query.page, 10);
  let limit = Number.parseInt(req.query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > 1000) page = 1000;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  return { page, limit, skip: (page - 1) * limit };
}

class ApiError extends Error {
  constructor(status, message, opts = {}) {
    super(message);
    this.status = status;
    this.expose = opts.expose !== false; // default: yes, this message is safe to show
    this.code = opts.code || null;
  }
}
const apiError = (status, msg, opts) => new ApiError(status, msg, opts);

function notFound(req, res, next) {
  res.status(404).json({ message: 'Not found' });
}

// Centralized error handler — must be the LAST middleware.
// We log everything server-side and only return safe messages to the client.
// In production we never echo error.message unless we marked it as expose=true.
function errorHandler(err, req, res, next) {
  // Multer file size / kind problems → 400
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'File too large' });
  }
  if (err && err.message === 'Images only') {
    return res.status(415).json({ message: 'Only JPEG/PNG/WEBP images are allowed' });
  }
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid id' });
  }
  if (err && err.message && /CORS: origin/.test(err.message)) {
    return res.status(403).json({ message: 'Origin not allowed' });
  }

  const status = (err && err.status) || 500;
  const expose = err && err.expose && err.message;
  const message = expose ? err.message : (status >= 500 ? 'Internal server error' : 'Request failed');

  // Log full detail server-side (request id, stack, method/url) — never to the client.
  const ctx = {
    err: { msg: err?.message, stack: err?.stack },
    reqId: req.id,
    method: req.method,
    url: req.originalUrl,
    user: req.user?._id?.toString?.(),
  };
  logger.error(ctx, 'request_failed');
  if (status >= 500) {
    try { captureException(err, ctx); } catch { /* monitor failure must never crash response */ }
  }

  if (!isProd && status >= 500) {
    return res.status(status).json({ message, error: err?.message });
  }
  res.status(status).json({ message });
}

module.exports = {
  isObjectId,
  requireObjectId,
  parsePagination,
  apiError,
  ApiError,
  notFound,
  errorHandler,
};
