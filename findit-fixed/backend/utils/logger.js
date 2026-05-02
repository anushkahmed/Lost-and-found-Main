// utils/logger.js — pino-based structured logger with redaction.
//
// We use pino because it's fast, structured (JSON in prod, pretty in dev),
// and supports field-level redaction so passwords / tokens / auth headers
// are never written to disk or stdout.

const pino = require('pino');

const isProd = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.code',
      '*.twoFactorSecret',
      '*.twoFactorToken',
      '*.passwordResetToken',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
    remove: false,
  },
  // Pretty output only in development (dev dependency optional)
  transport: !isProd ? {
    target: 'pino/file',
    options: { destination: 1 }, // stdout, no-op transformer
  } : undefined,
  base: { service: 'findit-api', env: process.env.NODE_ENV || 'development' },
});

module.exports = logger;
