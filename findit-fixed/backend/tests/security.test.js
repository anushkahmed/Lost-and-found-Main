// tests/security.test.js
//
// Cross-cutting security checks:
//   • helmet & content-security headers are set
//   • RBAC: a non-owner non-admin cannot edit another user's item (IDOR)
//   • RBAC: a non-admin cannot escalate `status` via PUT mass-assignment
//   • requireObjectId rejects bogus IDs (no NoSQL operator passthrough)

const request = require('supertest');
const mongoose = require('mongoose');
const { buildApp, disconnect } = require('./app.factory');

let app;
let User, Item;

beforeAll(async () => {
  app = await buildApp();
  User = require('../models/User');
  Item = require('../models/Item');
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({});
    await Item.deleteMany({});
  }
});

const strongPassword = 'CorrectHorseBattery9';

async function registerAndAccess(name, email) {
  const r = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password: strongPassword });
  return r.body.token;
}

describe('helmet headers', () => {
  it('sets x-content-type-options and x-frame-options-friendly headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    // helmet 7 sets either x-dns-prefetch-control or referrer-policy
    expect(res.headers['referrer-policy']).toBeDefined();
  });
});

describe('RBAC — IDOR on PUT /api/items/:id', () => {
  it('a non-owner, non-admin cannot edit another user\'s item', async () => {
    const aliceToken = await registerAndAccess('Alice', 'alice2@test.com');
    const malloryToken = await registerAndAccess('Mallory', 'mallory2@test.com');

    // Alice owns an item directly via the model (skip multipart upload in unit tests)
    const alice = await User.findOne({ email: 'alice2@test.com' });
    const item = await Item.create({
      name: 'Backpack',
      category: 'Bags',
      foundLocation: 'Library',
      date: new Date(),
      postedBy: alice._id,
      images: [],
      ownershipQuestions: [],
    });

    // Mallory tries to edit
    const res = await request(app)
      .put(`/api/items/${item._id}`)
      .set('Authorization', `Bearer ${malloryToken}`)
      .send({ name: 'STOLEN' });
    expect(res.status).toBe(403);

    // ensure DB is untouched
    const stillSafe = await Item.findById(item._id);
    expect(stillSafe.name).toBe('Backpack');

    // sanity: alice can edit her own
    const ok = await request(app)
      .put(`/api/items/${item._id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Backpack v2' });
    expect(ok.status).toBe(200);
  });

  it('a non-admin cannot mass-assign status / highValueApproved', async () => {
    const userToken = await registerAndAccess('User', 'u3@test.com');
    const me = await User.findOne({ email: 'u3@test.com' });
    const item = await Item.create({
      name: 'Hoodie', category: 'Clothing', foundLocation: 'Gym',
      date: new Date(), postedBy: me._id, images: [], ownershipQuestions: [],
      status: 'found', isHighValue: true, highValueApproved: false,
    });

    const res = await request(app)
      .put(`/api/items/${item._id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'returned', highValueApproved: true, name: 'Hoodie v2' });

    // Whitelist drops status/highValueApproved silently — only `name` is applied.
    expect(res.status).toBe(200);
    const after = await Item.findById(item._id);
    expect(after.status).toBe('found');                 // unchanged
    expect(after.highValueApproved).toBe(false);        // unchanged
    expect(after.name).toBe('Hoodie v2');               // changed
  });
});

describe('requireObjectId', () => {
  it('rejects malformed IDs with 400', async () => {
    const token = await registerAndAccess('Z', 'z@test.com');
    const res = await request(app)
      .put('/api/items/not-an-objectid')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' });
    expect(res.status).toBe(400);
  });

  it('rejects NoSQL operator object as id (mongo-sanitize strips, then 400)', async () => {
    const token = await registerAndAccess('Z2', 'z2@test.com');
    // We can't put an object in a path segment naturally, but test the JSON
    // body equivalent: the route uses :id from path so this is equivalent.
    const res = await request(app)
      .put('/api/items/{"$ne":null}')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect([400, 404]).toContain(res.status);
  });
});

describe('GET /api/health and /api/ready', () => {
  it('health returns 200 even when not authenticated', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
  it('ready returns 200 because the test mongo is connected', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
  });
});
