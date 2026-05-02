// tests/auth.test.js
//
// Smoke tests for the security-critical auth surface. These are NOT
// exhaustive — they're the regression guard for the Phase A hardening:
//   • register strips unknown fields (mass-assignment of role)
//   • login rejects NoSQL operator injection
//   • account lockout after 5 bad passwords
//   • refresh-cookie + tokenVersion rotation
//   • logout bumps tokenVersion (refresh becomes invalid)

const request = require('supertest');
const mongoose = require('mongoose');
const { buildApp, disconnect } = require('./app.factory');

let app;
let User;

beforeAll(async () => {
  app = await buildApp();
  User = require('../models/User');
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({});
  }
});

const strongPassword = 'CorrectHorseBattery9';

describe('POST /api/auth/register', () => {
  it('creates a user and returns an access token + sets refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@test.com', password: strongPassword });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.email).toBe('alice@test.com');
    expect(res.body.role).toBe('user');
    // refresh cookie set
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.some((c) => c.startsWith('findit_rt='))).toBe(true);
    expect(cookies.some((c) => /HttpOnly/i.test(c) && /findit_rt/.test(c))).toBe(true);
  });

  it('rejects mass-assignment of role (Zod strips unknowns)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Mallory', email: 'm@test.com', password: strongPassword, role: 'admin' });
    // strict schema rejects unknown keys outright
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid body/i);
  });

  it('rejects weak passwords', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bob', email: 'b@test.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Carl', email: 'dupe@test.com', password: strongPassword });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Carl2', email: 'dupe@test.com', password: strongPassword });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already registered/i);
  });
});

describe('POST /api/auth/login — NoSQL injection', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Vic', email: 'vic@test.com', password: strongPassword });
  });

  it('rejects {"email":{"$ne":null}} payload', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });
    // Zod rejects non-string types up front → 400, not 200
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  it('rejects array email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ['vic@test.com'], password: strongPassword });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login — lockout', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Lockie', email: 'lock@test.com', password: strongPassword });
  });

  it('locks account after 5 wrong passwords', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: 'lock@test.com', password: 'wrong-password-X' });
      expect(r.status).toBe(400);
    }
    const finalAttempt = await request(app)
      .post('/api/auth/login')
      .send({ email: 'lock@test.com', password: strongPassword }); // even correct should fail now
    expect(finalAttempt.status).toBe(429);
    expect(finalAttempt.body.message).toMatch(/locked/i);
  });
});

describe('POST /api/auth/refresh + /logout', () => {
  let cookie;

  beforeEach(async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Refr', email: 'refr@test.com', password: strongPassword });
    const cookies = reg.headers['set-cookie'] || [];
    cookie = cookies.find((c) => c.startsWith('findit_rt='));
    expect(cookie).toBeTruthy();
  });

  it('exchanges refresh cookie for a new access token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.email).toBe('refr@test.com');
  });

  it('rejects refresh after logout (tokenVersion bumped)', async () => {
    // First refresh to get an access token
    const ref = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie);
    const access = ref.body.token;
    // Logout
    const out = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Authorization', `Bearer ${access}`);
    expect(out.status).toBe(200);
    // The original cookie now points at a stale tokenVersion
    const after = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie);
    expect(after.status).toBe(401);
  });
});

describe('POST /api/auth/refresh without cookie', () => {
  it('returns 401', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });
});
