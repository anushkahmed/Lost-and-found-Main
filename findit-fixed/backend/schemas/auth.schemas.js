// schemas/auth.schemas.js
//
// Canonical Zod shapes for the authentication routes. These run BEFORE the
// hand-rolled defensive checks in routes/auth.js. Two layers of validation
// are deliberate — Zod is the structural gate (types + length + format) and
// the manual layer enforces business rules (lockout state, password
// blacklist, generic-response on enumeration attempts) that don't belong in
// a schema.

const { z } = require('zod');

const COMMON_PASSWORDS = new Set([
  'password123','password1234','qwerty12345','letmein123','welcome123',
  'iloveyou123','admin1234','12345678910','passw0rd!','password!',
]);

const passwordRule = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200, 'Password is too long')
  .refine((v) => /[a-z]/.test(v), { message: 'Password must contain a lowercase letter' })
  .refine((v) => /[A-Z]/.test(v), { message: 'Password must contain an uppercase letter' })
  .refine((v) => /[0-9]/.test(v), { message: 'Password must contain a number' })
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), { message: 'Password is too common' });

const emailRule = z
  .string()
  .trim()
  .toLowerCase()
  .email('Valid email is required')
  .max(254, 'Email is too long');

const registerBody = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long'),
  email: emailRule,
  password: passwordRule,
  phone: z.string().trim().max(32).optional().default(''),
});

const loginBody = z.strictObject({
  email: emailRule,
  password: z.string().min(1).max(200), // policy enforced on register/reset, login just checks shape
});

const twoFaLoginBody = z.strictObject({
  twoFactorToken: z.string().min(10).max(2048),
  code: z.string().trim().min(4).max(10),
});

const forgotPasswordBody = z.strictObject({
  email: emailRule,
});

const resetPasswordBody = z.strictObject({
  token: z.string().min(20).max(256),
  email: emailRule,
  password: passwordRule,
});

module.exports = {
  registerBody,
  loginBody,
  twoFaLoginBody,
  forgotPasswordBody,
  resetPasswordBody,
};
