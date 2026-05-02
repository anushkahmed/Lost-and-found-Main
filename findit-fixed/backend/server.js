require('dns').setDefaultResultOrder('ipv4first');
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
// ============================================================
// server.js — Main Entry Point
// Node.js + Express + Socket.io + MongoDB — hardened for production.
// ============================================================

const express        = require('express');
const mongoose       = require('mongoose');
const cors           = require('cors');
const helmet         = require('helmet');
const cookieParser   = require('cookie-parser');
const mongoSanitize  = require('express-mongo-sanitize');
const hpp            = require('hpp');
const pinoHttp       = require('pino-http');
const dotenv         = require('dotenv');
const jwt            = require('jsonwebtoken');
const http           = require('http');
const path           = require('path');
const dns            = require('dns');
const crypto         = require('crypto');
const { Server }     = require('socket.io');

dns.setDefaultResultOrder('ipv4first');
dotenv.config();

const { validateEnv } = require('./utils/env');
validateEnv(); // exits the process if required env is missing/invalid

const logger = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/security');
const User = require('./models/User');
const { Conversation } = require('./models/OtherModels');

const isProd = process.env.NODE_ENV === 'production';

// ─── CORS allowlist ──────────────────────────────────────────
// Comma-separated allowlist (e.g. CORS_ORIGIN=https://findit.app,https://www.findit.app)
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',').map(s => s.trim()).filter(Boolean);

const app = express();
const server = http.createServer(app);

// Trust the first proxy (Render / Heroku / Nginx) so secure cookies + req.ip work.
if (isProd) app.set('trust proxy', 1);

// ─── Socket.io setup with handshake auth ─────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// Reject any handshake without a valid access token. The client must send
// either auth.token (preferred) or pass it in the query for legacy reasons.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('unauthorized'));
    const decoded = jwt.verify(String(token), process.env.JWT_SECRET);
    if (!decoded || decoded.twofa === 'pending') return next(new Error('unauthorized'));
    const user = await User.findById(decoded.id).select('_id role active');
    if (!user || user.active === false) return next(new Error('unauthorized'));
    socket.user = { id: user._id.toString(), role: user.role };
    next();
  } catch (err) {
    next(new Error('unauthorized'));
  }
});

// Make io accessible in routes via req.io
app.use((req, res, next) => { req.io = io; next(); });

// ─── Security middleware ─────────────────────────────────────
app.use(helmet({
  // Tuned for our React app with Leaflet tiles + recharts.  Frontend will be
  // served from a different origin (typical), so we set a permissive but
  // safe default-src for the API itself.
  contentSecurityPolicy: isProd ? {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "img-src": ["'self'", 'data:', 'blob:', 'https:'],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "connect-src": ["'self'", ...allowedOrigins],
      "frame-ancestors": ["'none'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
    },
  } : false, // disable CSP in dev for hot reload
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow FE to load /uploads images
  hsts: isProd ? { maxAge: 63072000, includeSubDomains: true, preload: false } : false,
  referrerPolicy: { policy: 'same-origin' },
}));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));

// Per-request id for log correlation.
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomBytes(8).toString('hex');
  res.setHeader('x-request-id', req.id);
  next();
});

// Structured access logs (passwords/tokens redacted by the logger).
app.use(pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Strip `$` and `.` from request payloads to neutralize NoSQL operator injection.
app.use(mongoSanitize());
// Prevent HTTP parameter pollution (`?role=user&role=admin` arrays).
app.use(hpp());

// Global per-IP cap (real users won't hit this; bots/scripts will).
app.use('/api/', apiLimiter);

// ─── Public uploads (item images & avatars only) ─────────────
// Chat attachments live in a private dir served by routes/chat.js.
app.use('/uploads/items', express.static(path.join(__dirname, 'uploads/items'), { maxAge: '7d' }));
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads/avatars'), { maxAge: '7d' }));

// ─── Health & readiness checks ───────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/ready', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  if (!dbReady) return res.status(503).json({ ok: false, db: 'disconnected' });
  res.json({ ok: true, db: 'connected' });
});

// ─── Routes ──────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/items',         require('./routes/items'));
app.use('/api/claims',        require('./routes/claims'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/matches',       require('./routes/matches'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/chat',          require('./routes/chat'));
app.use('/api/abuse',         require('./routes/abuse'));
app.use('/api/admin',         require('./routes/adminReports'));
app.use('/api/admin/logs',    require('./routes/systemLogs'));
app.use('/api/admin/backups', require('./routes/backups'));
app.use('/api/2fa',           require('./routes/twofa'));
app.use('/api/leaderboard',   require('./routes/leaderboard'));
app.use('/api/categories',    require('./routes/categories'));
app.use('/api/feedback',      require('./routes/feedback'));

// ─── 404 + centralized error handler ─────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── MongoDB connection ──────────────────────────────────────
mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 10000,
  family: 4
})
  .then(() => logger.info('MongoDB connected'))
  .catch(err => logger.error({ err: err.message }, 'mongo_connect_failed'));

// ─── Background jobs ─────────────────────────────────────────
require('./cron/expiry')(io);
require('./cron/backup')(io);

// ─── Socket.io events (now authenticated; user identity comes from socket.user) ─
io.on('connection', (socket) => {
  logger.info({ socketId: socket.id, userId: socket.user.id }, 'socket_connected');

  // Force the user into THEIR room only — the client never gets to choose.
  socket.join(socket.user.id);

  // Chat typing indicator — only forward if the sender is actually a participant
  // of the conversation. Otherwise silently drop.
  socket.on('chat:typing', async ({ toUserId, conversationId, isTyping }) => {
    try {
      if (!toUserId || !conversationId) return;
      if (typeof toUserId !== 'string' || typeof conversationId !== 'string') return;
      const convo = await Conversation.findById(conversationId).select('participants');
      if (!convo) return;
      const isMember = convo.participants.some(p => p.toString() === socket.user.id);
      if (!isMember) return;
      const otherIsParticipant = convo.participants.some(p => p.toString() === toUserId);
      if (!otherIsParticipant) return;
      io.to(toUserId).emit('chat:typing', {
        conversationId,
        fromUserId: socket.user.id,
        isTyping: Boolean(isTyping),
      });
    } catch (err) {
      logger.warn({ err: err.message }, 'chat_typing_dropped');
    }
  });

  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id }, 'socket_disconnected');
  });
});

// ─── Start server ────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info({ port: PORT }, `Server running on http://localhost:${PORT}`);
});

// ─── Graceful shutdown ───────────────────────────────────────
function shutdown(signal) {
  logger.info({ signal }, 'shutting_down');
  // Stop accepting new HTTP connections; drain in-flight ones.
  server.close(() => {
    logger.info('http_closed');
    io.close(() => logger.info('socket_closed'));
    mongoose.connection.close(false, () => {
      logger.info('mongo_closed');
      process.exit(0);
    });
  });
  // Force exit if drain takes longer than 15s.
  setTimeout(() => process.exit(1), 15000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ─── Unhandled rejection / exception fallbacks ───────────────
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason?.message || reason, stack: reason?.stack }, 'unhandled_rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err: err.message, stack: err.stack }, 'uncaught_exception');
  // We let the process crash; the supervisor (Render/PM2) restarts us.
  shutdown('uncaughtException');
});

