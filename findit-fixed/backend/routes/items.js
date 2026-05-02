// routes/items.js  — Feature 1: Post Items | Feature 2: Search & Filter
//
// Hardening notes:
//   • All user search inputs are coerced to safe primitives, then sanitized
//     to neutral regex (`escapeRegex`) so a crafted `colour=^.*$` can't blow
//     up our query planner.
//   • Pagination is capped (`parsePagination`) so an attacker can't request
//     `?limit=999999` and exhaust memory.
//   • File uploads use the hardened `makeImageUpload` factory (random filename,
//     extension+MIME allowlist) and `verifyMagicBytesMiddleware` (real magic
//     bytes after disk write).
//   • Path-traversal in stored paths is impossible because the filename is
//     `crypto.randomBytes(16).hex + .ext`; we never trust originalname.
//   • req.io.emit('item:new', …) projects only safe poster fields.

const express = require('express');
const router  = express.Router();
const path    = require('path');

const Item = require('../models/Item');
const User = require('../models/User');
const { ItemHistory } = require('../models/Phase2Models');
const { Category } = require('../models/Phase2Models');
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { requireObjectId, parsePagination } = require('../middleware/security');
const { uploadLimiter } = require('../middleware/rateLimiters');
const { makeImageUpload, verifyMagicBytesMiddleware } = require('../utils/upload');

const upload = makeImageUpload('items', { maxBytes: 5 * 1024 * 1024 });

const logHistory = (entry) => {
  ItemHistory.create(entry).catch((e) => console.error('ItemHistory log failed:', e.message));
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Haversine distance in km
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const FALLBACK_CATEGORIES = ['Electronics', 'Clothing', 'Documents', 'Accessories', 'Keys', 'Bags', 'Other'];
const VALID_STATUSES   = ['found', 'claimed', 'returned', 'expired', 'archived'];

// Dynamic category validation — reads from DB, falls back to hardcoded
async function getValidCategories() {
  try {
    const cats = await Category.find({ active: true }).select('name');
    if (cats.length > 0) return cats.map(c => c.name);
  } catch {}
  return FALLBACK_CATEGORIES;
}

// ─── GET /api/items ── Feature 2: Search & Filter ────────────
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req, { defaultLimit: 12, maxLimit: 50 });
  const search   = typeof req.query.search   === 'string' ? req.query.search.slice(0, 100)   : '';
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  const colour   = typeof req.query.colour   === 'string' ? req.query.colour.slice(0, 50)   : '';
  const location = typeof req.query.location === 'string' ? req.query.location.slice(0, 100) : '';
  const date     = typeof req.query.date     === 'string' ? req.query.date     : '';
  const status   = typeof req.query.status   === 'string' ? req.query.status   : '';

  const query = { archived: { $ne: true } };

  if (search)   query.$text = { $search: search };
  if (category) {
    const validCats = await getValidCategories();
    if (validCats.includes(category)) query.category = category;
  }
  if (colour)   query.colour = { $regex: escapeRegex(colour), $options: 'i' };
  if (location) query.foundLocation = { $regex: escapeRegex(location), $options: 'i' };
  if (status && VALID_STATUSES.includes(status)) query.status = status;
  if (date) {
    const start = new Date(date);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      query.date = { $gte: start, $lt: end };
    }
  }

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const geoFilter = Number.isFinite(lat) && Number.isFinite(lng) &&
                    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  if (geoFilter) {
    query['coordinates.lat'] = { $ne: null };
    query['coordinates.lng'] = { $ne: null };

    const all = await Item.find(query).populate('postedBy', 'name email').sort({ createdAt: -1 });
    const r = Math.max(0.1, Math.min(50, Number(req.query.radius) || 5));
    const filtered = all
      .map(it => ({ it, d: haversineKm(lat, lng, it.coordinates.lat, it.coordinates.lng) }))
      .filter(x => x.d <= r)
      .sort((a, b) => a.d - b.d);
    const total = filtered.length;
    const items = filtered.slice(skip, skip + limit).map(x => ({
      ...x.it.toObject(),
      distanceKm: Math.round(x.d * 10) / 10,
    }));
    return res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  }

  const total = await Item.countDocuments(query);
  const items = await Item.find(query)
    .populate('postedBy', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

// ─── GET /api/items/meta/heatmap ── lat/lng of all visible items ──
router.get('/meta/heatmap', protect, asyncHandler(async (req, res) => {
  const items = await Item.find({
    archived: { $ne: true },
    'coordinates.lat': { $ne: null },
    'coordinates.lng': { $ne: null },
  }).select('name category status foundLocation coordinates createdAt').limit(1000);
  res.json(items);
}));

// ─── GET /api/items/:id ───────────────────────────────────────
router.get('/:id', requireObjectId('id'), asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id).populate('postedBy', 'name email');
  if (!item) return res.status(404).json({ message: 'Item not found' });
  res.json(item);
}));

// ─── PUT /api/items/:id/renew ── Renew expiry ──────────────────
router.put('/:id/renew', protect, requireObjectId('id'), asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found' });

  const isOwner = item.postedBy.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Not allowed' });
  }

  const prevStatus = item.status;
  item.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  item.renewedAt = new Date();
  if (item.status === 'expired') item.status = 'found';
  item.archived = false;
  await item.save();

  logHistory({
    itemId: item._id, changedBy: req.user._id, action: 'renewed',
    fromStatus: prevStatus, toStatus: item.status, meta: { expiresAt: item.expiresAt }
  });

  res.json({ message: 'Renewed', item });
}));

// ─── POST /api/items ── Feature 1: Post Found Item ───────────
router.post(
  '/',
  protect,
  uploadLimiter,
  upload.array('images', 5),
  verifyMagicBytesMiddleware,
  asyncHandler(async (req, res) => {
    const name        = (typeof req.body.name === 'string' ? req.body.name.trim() : '').slice(0, 120);
    const category    = typeof req.body.category === 'string' ? req.body.category : '';
    const colour      = (typeof req.body.colour === 'string' ? req.body.colour.trim() : '').slice(0, 60);
    const brand       = (typeof req.body.brand === 'string' ? req.body.brand.trim() : '').slice(0, 60);
    const description = (typeof req.body.description === 'string' ? req.body.description.trim() : '').slice(0, 2000);
    const foundLocation   = (typeof req.body.foundLocation === 'string' ? req.body.foundLocation.trim() : '').slice(0, 200);
    const storageLocation = (typeof req.body.storageLocation === 'string' ? req.body.storageLocation.trim() : '').slice(0, 200);
    const date            = typeof req.body.date === 'string' ? req.body.date : '';

    if (!name)     return res.status(400).json({ message: 'Name is required' });
    const validCats = await getValidCategories();
    if (!validCats.includes(category)) return res.status(400).json({ message: 'Invalid category' });
    if (!foundLocation) return res.status(400).json({ message: 'foundLocation is required' });
    const dateObj = new Date(date);
    if (Number.isNaN(dateObj.getTime())) return res.status(400).json({ message: 'Invalid date' });
    // Reject dates in the far future (typo / abuse)
    if (dateObj.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: 'date cannot be in the future' });
    }

    const imagePaths = req.files ? req.files.map(f => f.path.split(path.sep).join('/')) : [];

    let ownershipQuestions = [];
    try {
      if (req.body.ownershipQuestions) {
        ownershipQuestions = JSON.parse(req.body.ownershipQuestions);
        if (!Array.isArray(ownershipQuestions)) ownershipQuestions = [];
      }
    } catch { ownershipQuestions = []; }
    ownershipQuestions = ownershipQuestions
      .slice(0, 10) // cap
      .filter(q => q && typeof q.question === 'string' && q.question.trim())
      .map(q => ({ question: q.question.trim().slice(0, 200) }));

    const wantsHighValue = String(req.body.isHighValue).toLowerCase() === 'true';

    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const validCoords = Number.isFinite(lat) && Number.isFinite(lng) &&
                        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

    const item = await Item.create({
      name, category, colour, brand, description,
      foundLocation, storageLocation, date: dateObj,
      coordinates: validCoords ? { lat, lng } : { lat: null, lng: null },
      images: imagePaths,
      isHighValue: wantsHighValue,
      highValueApproved: wantsHighValue ? false : true,
      ownershipQuestions,
      postedBy: req.user._id,
    });

    logHistory({
      itemId: item._id, changedBy: req.user._id, action: 'created',
      toStatus: item.status,
      meta: { isHighValue: item.isHighValue, highValueApproved: item.highValueApproved }
    });

    User.findByIdAndUpdate(req.user._id, { $inc: { points: 5 } }).catch(() => {});

    // Project only what's safe to broadcast — never the poster's email.
    req.io.emit('item:new', {
      item: {
        _id: item._id, name: item.name, category: item.category,
        images: item.images, status: item.status, isHighValue: item.isHighValue,
        coordinates: item.coordinates, createdAt: item.createdAt,
      },
      message: `New item posted: ${item.name}`,
    });
    res.status(201).json(item);
  })
);

// ─── PUT /api/items/:id ── Update item ───────────────────────
router.put('/:id', protect, requireObjectId('id'), asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found' });

  const isOwner = item.postedBy.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Not allowed' });
  }

  // Whitelist updatable fields — prevent overwriting postedBy, images, _id, etc.
  // Non-admins can never change `status`.
  const ALLOWED = ['name','category','colour','brand','description',
                   'foundLocation','storageLocation','date'];
  const ADMIN_ALLOWED = [...ALLOWED, 'status', 'highValueApproved'];
  const list = req.user.role === 'admin' ? ADMIN_ALLOWED : ALLOWED;

  const updates = {};
  list.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  if (updates.category) {
    const validCats = await getValidCategories();
    if (!validCats.includes(updates.category)) {
      return res.status(400).json({ message: 'Invalid category' });
    }
  }
  if (updates.status && !VALID_STATUSES.includes(updates.status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const prevStatus = item.status;
  const updated = await Item.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

  if (updates.status && updates.status !== prevStatus) {
    logHistory({
      itemId: updated._id, changedBy: req.user._id,
      action: `status:${updates.status}`, fromStatus: prevStatus, toStatus: updates.status
    });
    req.io.emit('item:status', { itemId: req.params.id, status: updates.status });
  } else if (Object.keys(updates).length > 0) {
    logHistory({
      itemId: updated._id, changedBy: req.user._id, action: 'edited',
      fromStatus: prevStatus, toStatus: updated.status, meta: { fields: Object.keys(updates) }
    });
  }

  res.json(updated);
}));

// ─── DELETE /api/items/:id ────────────────────────────────────
router.delete('/:id', protect, adminOnly, requireObjectId('id'), asyncHandler(async (req, res) => {
  const item = await Item.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found' });
  logHistory({
    itemId: item._id, changedBy: req.user._id, action: 'deleted',
    fromStatus: item.status, toStatus: ''
  });
  res.json({ message: 'Item deleted' });
}));

// ─── GET /api/items/:id/history ── Item audit trail ───────────
router.get('/:id/history', protect, requireObjectId('id'), asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found' });
  const isOwner = item.postedBy.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Not allowed' });
  }
  const history = await ItemHistory.find({ itemId: item._id })
    .populate('changedBy', 'name email role')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json(history);
}));

module.exports = router;
