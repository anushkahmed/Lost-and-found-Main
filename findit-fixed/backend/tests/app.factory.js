// tests/app.factory.js
//
// Builds the same Express app server.js wires up, but without:
//   • server.listen()
//   • Socket.io
//   • cron jobs
//   • pino-http (silent — too noisy in CI)
// This lets supertest hit the real routes + middleware stack.
//
// We connect to the in-memory mongo URI seeded by global-setup.js BEFORE
// returning the app so models work on the very first request.

const express        = require('express');
const cors           = require('cors');
const helmet         = require('helmet');
const cookieParser   = require('cookie-parser');
const mongoSanitize  = require('express-mongo-sanitize');
const hpp            = require('hpp');
const mongoose       = require('mongoose');
const path           = require('path');
const crypto         = require('crypto');

const { apiLimiter } = require('../middleware/rateLimiters');
const { notFound, errorHandler } = require('../middleware/security');

let _connected = false;

async function connectMongo() {
  if (_connected) return;
  const uri = process.env.MONGO_URI || process.env.__MONGO_URI__;
  if (!uri) throw new Error('MONGO_URI not set — global-setup.js did not run');
  await mongoose.connect(uri);
  _connected = true;
}

async function buildApp() {
  await connectMongo();

  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, hsts: false }));
  app.use(cors({ origin: 'http://localhost:3000', credentials: true }));

  app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomBytes(8).toString('hex');
    res.setHeader('x-request-id', req.id);
    next();
  });

  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(mongoSanitize());
  app.use(hpp());

  // Stub req.io so route handlers that call req.io.to(...).emit(...) don't blow up.
  app.use((req, res, next) => {
    req.io = { to: () => ({ emit: () => {} }), emit: () => {} };
    next();
  });

  // Skip apiLimiter to keep tests deterministic (we test rate-limiting in
  // a focused test block by mounting it on a dedicated path).
  // app.use('/api/', apiLimiter);

  // Static uploads (won't be touched in unit tests).
  app.use('/uploads/items', express.static(path.join(__dirname, '..', 'uploads/items')));
  app.use('/uploads/avatars', express.static(path.join(__dirname, '..', 'uploads/avatars')));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/ready', (_req, res) => {
    const dbReady = mongoose.connection.readyState === 1;
    if (!dbReady) return res.status(503).json({ ok: false, db: 'disconnected' });
    res.json({ ok: true, db: 'connected' });
  });

  app.use('/api/auth',          require('../routes/auth'));
  app.use('/api/items',         require('../routes/items'));
  app.use('/api/claims',        require('../routes/claims'));
  app.use('/api/notifications', require('../routes/notifications'));
  app.use('/api/announcements', require('../routes/announcements'));
  app.use('/api/matches',       require('../routes/matches'));
  app.use('/api/users',         require('../routes/users'));
  app.use('/api/chat',          require('../routes/chat'));
  app.use('/api/abuse',         require('../routes/abuse'));
  app.use('/api/admin',         require('../routes/adminReports'));
  app.use('/api/2fa',           require('../routes/twofa'));
  app.use('/api/leaderboard',   require('../routes/leaderboard'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function disconnect() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.disconnect();
  }
  _connected = false;
}

module.exports = { buildApp, disconnect };
