// routes/matches.js — Feature 3: Matching System
const express = require('express');
const router  = express.Router();
const Item = require('../models/Item');
const { Match, Notification, LostReport } = require('../models/OtherModels');
const { Category } = require('../models/Phase2Models');
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { requireObjectId } = require('../middleware/security');

const FALLBACK_CATEGORIES = ['Electronics', 'Clothing', 'Documents', 'Accessories', 'Keys', 'Bags', 'Other'];

async function getValidCategories() {
  try {
    const cats = await Category.find({ active: true }).select('name');
    if (cats.length > 0) return cats.map(c => c.name);
  } catch {}
  return FALLBACK_CATEGORIES;
}

function calculateMatchScore(foundItem, lostReport) {
  let score = 0;
  if (foundItem.category === lostReport.category) score += 40;
  if (foundItem.colour && lostReport.colour) {
    const f = foundItem.colour.toLowerCase();
    const l = lostReport.colour.toLowerCase();
    if (f === l) score += 25;
    else if (f.includes(l) || l.includes(f)) score += 15;
  }
  if (foundItem.foundLocation && lostReport.lostLocation) {
    const fWords = foundItem.foundLocation.toLowerCase().split(/\s+/);
    const lWords = lostReport.lostLocation.toLowerCase().split(/\s+/);
    const overlap = fWords.filter(w => lWords.includes(w) && w.length > 2);
    if (overlap.length > 0) score += Math.min(20, overlap.length * 7);
  }
  if (foundItem.date && lostReport.date) {
    const diff = Math.abs(new Date(foundItem.date) - new Date(lostReport.date));
    const days = diff / (1000 * 60 * 60 * 24);
    if (days <= 1) score += 15;
    else if (days <= 3) score += 10;
    else if (days <= 7) score += 5;
  }
  if (foundItem.isHighValue) score += 10;
  return score;
}

router.post('/report-lost', protect, asyncHandler(async (req, res) => {
  const name        = (typeof req.body.name === 'string' ? req.body.name.trim() : '').slice(0, 120);
  const category    = typeof req.body.category === 'string' ? req.body.category : '';
  const colour      = (typeof req.body.colour === 'string' ? req.body.colour.trim() : '').slice(0, 60);
  const description = (typeof req.body.description === 'string' ? req.body.description.trim() : '').slice(0, 2000);
  const lostLocation= (typeof req.body.lostLocation === 'string' ? req.body.lostLocation.trim() : '').slice(0, 200);
  const date        = typeof req.body.date === 'string' ? req.body.date : '';

  if (!name || !category || !lostLocation || !date) {
    return res.status(400).json({ message: 'name, category, lostLocation and date are required' });
  }
  const validCats = await getValidCategories();
  if (!validCats.includes(category)) {
    return res.status(400).json({ message: 'Invalid category' });
  }
  const dateObj = new Date(date);
  if (Number.isNaN(dateObj.getTime())) return res.status(400).json({ message: 'Invalid date' });
  if (dateObj.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return res.status(400).json({ message: 'date cannot be in the future' });
  }

  const report = await LostReport.create({
    name, category, colour, description, lostLocation, date: dateObj,
    reportedBy: req.user._id
  });
  res.status(201).json(report);
}));

router.post('/run', protect, adminOnly, asyncHandler(async (req, res) => {
  const foundItems  = await Item.find({ status: 'found' });
  const lostReports = await LostReport.find({ status: 'searching' }).populate('reportedBy', 'trustScore');
  const newMatches  = [];

  for (const found of foundItems) {
    for (const lost of lostReports) {
      let score = calculateMatchScore(found, lost);
      if ((lost.reportedBy?.trustScore || 0) >= 70) score += 5;
      if (score >= 60) {
        const exists = await Match.findOne({ foundItem: found._id, lostReport: lost._id });
        if (!exists) {
          const match = await Match.create({ foundItem: found._id, lostReport: lost._id, score });
          newMatches.push(match);
          await Notification.create({
            userId:  lost.reportedBy,
            type:    'match',
            title:   'Possible match found!',
            message: `Your lost "${lost.name}" may have been found. Match score: ${score}%`,
            itemId:  found._id
          });
          req.io.to(lost.reportedBy.toString()).emit('match:found', {
            message: `Possible match for your "${lost.name}" — score ${score}%`,
            matchId: match._id
          });
        }
      }
    }
  }

  res.json({ message: `Matching complete. ${newMatches.length} new matches found.`, matches: newMatches });
}));

router.get('/', protect, asyncHandler(async (req, res) => {
  let matches;
  if (req.user.role === 'admin') {
    matches = await Match.find()
      .populate('foundItem')
      .populate('lostReport')
      .sort({ score: -1 });
  } else {
    const userReports = await LostReport.find({ reportedBy: req.user._id }).select('_id');
    const reportIds   = userReports.map(r => r._id);
    matches = await Match.find({ lostReport: { $in: reportIds } })
      .populate('foundItem')
      .populate('lostReport')
      .sort({ score: -1 });
  }
  matches.sort((a, b) => {
    const scoreDiff = (b.score || 0) - (a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const aHV = a.foundItem?.isHighValue ? 1 : 0;
    const bHV = b.foundItem?.isHighValue ? 1 : 0;
    return bHV - aHV;
  });
  res.json(matches);
}));

router.get('/my-reports', protect, asyncHandler(async (req, res) => {
  const reports = await LostReport.find({ reportedBy: req.user._id }).sort({ createdAt: -1 });
  res.json(reports);
}));

router.put('/:id', protect, adminOnly, requireObjectId('id'), asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['confirmed', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'status must be confirmed or rejected' });
  }

  const match = await Match.findByIdAndUpdate(
    req.params.id,
    { status, confirmedBy: req.user._id },
    { new: true }
  ).populate('foundItem').populate('lostReport');

  if (!match) return res.status(404).json({ message: 'Match not found' });

  if (status === 'confirmed') {
    await Item.findByIdAndUpdate(match.foundItem._id, { status: 'claimed', matchedWith: match.lostReport._id });
    await LostReport.findByIdAndUpdate(match.lostReport._id, { status: 'matched' });

    const notif = await Notification.create({
      userId:  match.lostReport.reportedBy,
      type:    'match',
      title:   'Match confirmed!',
      message: `Your lost "${match.lostReport.name}" has been matched and confirmed.`,
      itemId:  match.foundItem._id
    });

    req.io.to(match.lostReport.reportedBy.toString()).emit('claim:approved', {
      message: `Your match for "${match.lostReport.name}" was confirmed!`,
      notifId: notif._id
    });
  }

  res.json(match);
}));

module.exports = router;
