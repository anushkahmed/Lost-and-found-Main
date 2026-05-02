// utils/crypto.js — symmetric encryption helpers for tokens-at-rest.
//
// AES-256-GCM with a 96-bit IV. The encryption key is derived from
// TWOFA_ENC_KEY (or JWT_SECRET as fallback) via SHA-256 so any 32+ char
// secret is acceptable.

const crypto = require('crypto');

function getKey() {
  const raw = process.env.TWOFA_ENC_KEY || process.env.JWT_SECRET || '';
  if (raw.length < 16) {
    // Last-resort fallback so dev doesn't crash. Plaintext-equivalent — users get a warning at startup.
    return null;
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function encryptString(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === '') return '';
  const key = getKey();
  if (!key) return String(plaintext); // graceful degrade in dev
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: v1:base64(iv).base64(tag).base64(ciphertext)
  return `v1:${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
}

function decryptString(encoded) {
  if (!encoded) return '';
  if (!encoded.startsWith('v1:')) return encoded; // legacy / dev-fallback plaintext
  const key = getKey();
  if (!key) return encoded;
  try {
    const [, payload] = encoded.split('v1:');
    const [ivB64, tagB64, ctB64] = payload.split('.');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch (e) {
    return ''; // tampered or wrong key
  }
}

// Constant-time string comparison (use for tokens, OTPs, etc.)
function safeEqual(a, b) {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  if (A.length !== B.length) {
    crypto.timingSafeEqual(A, A); // dummy op to keep timing constant
    return false;
  }
  return crypto.timingSafeEqual(A, B);
}

module.exports = { encryptString, decryptString, safeEqual };
