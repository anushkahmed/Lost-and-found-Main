// routes/categories.js — Dynamic category management
// Public: GET list of active categories
// Admin: full CRUD (create, update, delete)

const express = require('express');
const router  = express.Router();
const { Category } = require('../models/Phase2Models');
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { requireObjectId } = require('../middleware/security');

// Default categories seeded on first access if the collection is empty
const DEFAULTS = [
  { name: 'Electronics',  icon: '📱', description: 'Phones, laptops, chargers, earbuds' },
  { name: 'Clothing',     icon: '👕', description: 'Jackets, hoodies, scarves, hats' },
  { name: 'Documents',    icon: '📄', description: 'IDs, passports, notebooks, certificates' },
  { name: 'Accessories',  icon: '👓', description: 'Glasses, watches, jewelry, wallets' },
  { name: 'Keys',         icon: '🔑', description: 'Room keys, car keys, key chains' },
  { name: 'Bags',         icon: '🎒', description: 'Backpacks, purses, tote bags, pouches' },
  { name: 'Other',        icon: '📦', description: 'Anything that doesn\'t fit above' },
];

async function seedIfEmpty() {
  const count = await Category.countDocuments();
  if (count === 0) {
    await Category.insertMany(DEFAULTS);
  }
}

// GET /api/categories — public list of active categories
router.get('/', asyncHandler(async (req, res) => {
  await seedIfEmpty();
  const includeInactive = req.query.all === 'true';
  const query = includeInactive ? {} : { active: true };
  const categories = await Category.find(query).sort({ name: 1 });
  res.json(categories);
}));

// POST /api/categories — admin create new category
router.post('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const name = (typeof req.body.name === 'string' ? req.body.name.trim() : '').slice(0, 60);
  const icon = (typeof req.body.icon === 'string' ? req.body.icon.trim() : '📦').slice(0, 10);
  const description = (typeof req.body.description === 'string' ? req.body.description.trim() : '').slice(0, 200);

  if (!name) return res.status(400).json({ message: 'Category name is required' });

  const exists = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (exists) return res.status(409).json({ message: 'Category already exists' });

  const category = await Category.create({ name, icon, description, createdBy: req.user._id });
  res.status(201).json(category);
}));

// PUT /api/categories/:id — admin update category
router.put('/:id', protect, adminOnly, requireObjectId('id'), asyncHandler(async (req, res) => {
  const updates = {};
  if (typeof req.body.name === 'string') updates.name = req.body.name.trim().slice(0, 60);
  if (typeof req.body.icon === 'string') updates.icon = req.body.icon.trim().slice(0, 10);
  if (typeof req.body.description === 'string') updates.description = req.body.description.trim().slice(0, 200);
  if (typeof req.body.active === 'boolean') updates.active = req.body.active;

  if (!Object.keys(updates).length) return res.status(400).json({ message: 'Nothing to update' });

  const category = await Category.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!category) return res.status(404).json({ message: 'Category not found' });
  res.json(category);
}));

// DELETE /api/categories/:id — admin delete category
router.delete('/:id', protect, adminOnly, requireObjectId('id'), asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json({ message: 'Category not found' });
  res.json({ message: 'Category deleted' });
}));

module.exports = router;
