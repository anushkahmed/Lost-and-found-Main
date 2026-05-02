// utils/env.js — fail-fast environment validation
// Called once during server startup. Missing critical config = process exit.

const REQUIRED = ['JWT_SECRET', 'MONGO_URI'];

const RECOMMENDED = [
  'JWT_REFRESH_SECRET',
  'TWOFA_ENC_KEY',
  'CORS_ORIGIN',
  'NODE_ENV',
];

function validateEnv() {
  const errors = [];
  const warnings = [];

  for (const key of REQUIRED) {
    if (!process.env[key] || !process.env[key].trim()) {
      errors.push(`Missing required env var: ${key}`);
    }
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters (use a long random string).');
  }

  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
    warnings.push('JWT_REFRESH_SECRET missing/short — falling back to JWT_SECRET+":refresh". Set a separate 32+ char secret in production.');
  }

  if (!process.env.TWOFA_ENC_KEY || process.env.TWOFA_ENC_KEY.length < 32) {
    warnings.push('TWOFA_ENC_KEY missing — 2FA secrets will not be encrypted at rest. Set a 32-char hex key in production.');
  }

  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    errors.push('In production, CORS_ORIGIN must be set to your real frontend origin(s).');
  }

  for (const key of RECOMMENDED) {
    if (!process.env[key]) {
      // already covered above with more specific messaging — skip generic noise
    }
  }

  if (errors.length) {
    console.error('\n[env] Configuration errors:');
    errors.forEach(e => console.error('  ✗ ' + e));
    process.exit(1);
  }
  if (warnings.length) {
    console.warn('\n[env] Configuration warnings:');
    warnings.forEach(w => console.warn('  ! ' + w));
  }
}

// Effective refresh secret — falls back so dev still works without manual setup
function refreshSecret() {
  return process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET + ':refresh');
}

module.exports = { validateEnv, refreshSecret };
