// tests/env.js — runs before every test FILE in a fresh Node context.
// We pin known-good secrets so validateEnv() is happy. The MONGO_URI is
// overwritten by global-setup.js once the in-memory mongo is ready.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_jest_only_32_chars__';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret_for_jest_only_32__';
process.env.TWOFA_ENC_KEY = process.env.TWOFA_ENC_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.ALLOW_ADMIN_BOOTSTRAP = 'false';
