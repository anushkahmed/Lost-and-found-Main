// routes/adminReports.js — Phase 2: Analytics + downloadable reports
const express = require('express');
const router  = express.Router();
const Item    = require('../models/Item');
const User    = require('../models/User');
const { Claim, Announcement } = require('../models/OtherModels');
const { AbuseReport } = require('../models/Phase2Models');
const { protect, adminOnly } = require('../middleware/auth');

const Papa  = require('papaparse');
const { jsPDF } = require('jspdf');

const daysBack = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function buildAnalytics() {
  const now = new Date();
  const start30 = daysBack(30);
  const start12mo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [
    totalItems, activeItems, returnedItems, expiredItems, archivedItems,
    highValuePending, totalUsers, activeUsers, totalClaims, approvedClaims,
    rejectedClaims, openAbuse, totalAnnouncements
  ] = await Promise.all([
    Item.countDocuments({}),
    Item.countDocuments({ status: 'found', archived: { $ne: true } }),
    Item.countDocuments({ status: 'returned' }),
    Item.countDocuments({ status: 'expired' }),
    Item.countDocuments({ archived: true }),
    Item.countDocuments({ isHighValue: true, highValueApproved: false }),
    User.countDocuments({}),
    User.countDocuments({ active: { $ne: false } }),
    Claim.countDocuments({}),
    Claim.countDocuments({ status: 'approved' }),
    Claim.countDocuments({ status: 'rejected' }),
    AbuseReport.countDocuments({ status: 'open' }),
    Announcement.countDocuments({}),
  ]);

  const recoveryRate = totalItems > 0
    ? Math.round((returnedItems / totalItems) * 1000) / 10
    : 0;

  // Items posted by month (last 12 months)
  const monthly = await Item.aggregate([
    { $match: { createdAt: { $gte: start12mo } } },
    { $group: {
        _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
        posted: { $sum: 1 },
        returned: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } }
    }},
    { $sort: { '_id.y': 1, '_id.m': 1 } }
  ]);
  const monthlyItems = monthly.map(d => ({
    label: `${d._id.y}-${String(d._id.m).padStart(2, '0')}`,
    posted: d.posted,
    returned: d.returned,
  }));

  // Category breakdown
  const byCategoryAgg = await Item.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  const byCategory = byCategoryAgg.map(c => ({ category: c._id || 'uncategorized', count: c.count }));

  // Status breakdown for current items
  const statusAgg = await Item.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  const byStatus = statusAgg.map(s => ({ status: s._id || 'unknown', count: s.count }));

  // Active users (posted or claimed in last 30d)
  const recentPosters = await Item.distinct('postedBy', { createdAt: { $gte: start30 } });
  const recentClaimers = await Claim.distinct('claimantId', { createdAt: { $gte: start30 } });
  const active30d = new Set([
    ...recentPosters.map(String),
    ...recentClaimers.map(String),
  ]).size;

  // Top trust score users (leaderboard)
  const topUsers = await User.find({ active: { $ne: false } })
    .select('name email trustScore verifiedBadge')
    .sort({ trustScore: -1 })
    .limit(10);

  return {
    summary: {
      totalItems, activeItems, returnedItems, expiredItems, archivedItems,
      highValuePending, totalUsers, activeUsers, totalClaims, approvedClaims,
      rejectedClaims, openAbuse, totalAnnouncements, active30d, recoveryRate
    },
    monthlyItems,
    byCategory,
    byStatus,
    topUsers,
  };
}

// GET /api/admin/analytics
router.get('/analytics', protect, adminOnly, async (req, res) => {
  try {
    const data = await buildAnalytics();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/admin/report?format=csv|pdf
router.get('/report', protect, adminOnly, async (req, res) => {
  try {
    const format = (req.query.format || 'csv').toLowerCase();
    const data = await buildAnalytics();

    if (format === 'csv') {
      const summaryRows = Object.entries(data.summary).map(([metric, value]) => ({ metric, value }));
      const byCatRows   = data.byCategory.map(c => ({ section: 'category', ...c }));
      const byStatRows  = data.byStatus.map(s => ({ section: 'status', ...s }));
      const monthlyRows = data.monthlyItems.map(m => ({ section: 'month', ...m }));

      const csvParts = [
        '# Summary',
        Papa.unparse(summaryRows),
        '',
        '# Items by category',
        Papa.unparse(byCatRows),
        '',
        '# Items by status',
        Papa.unparse(byStatRows),
        '',
        '# Items posted by month',
        Papa.unparse(monthlyRows),
      ];
      const csv = csvParts.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="lostfound-report-${Date.now()}.csv"`);
      return res.send(csv);
    }

    if (format === 'pdf') {
      const doc = new jsPDF();
      const margin = 14;
      let y = margin;

      doc.setFontSize(16);
      doc.text('Lost & Found — Admin Report', margin, y);
      y += 8;
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
      y += 10;

      doc.setFontSize(13);
      doc.text('Summary', margin, y); y += 7;
      doc.setFontSize(10);
      Object.entries(data.summary).forEach(([k, v]) => {
        if (y > 280) { doc.addPage(); y = margin; }
        doc.text(`${k}: ${v}`, margin, y); y += 6;
      });

      y += 4;
      if (y > 270) { doc.addPage(); y = margin; }
      doc.setFontSize(13); doc.text('Items by category', margin, y); y += 7;
      doc.setFontSize(10);
      data.byCategory.forEach(c => {
        if (y > 280) { doc.addPage(); y = margin; }
        doc.text(`${c.category}: ${c.count}`, margin, y); y += 6;
      });

      y += 4;
      if (y > 270) { doc.addPage(); y = margin; }
      doc.setFontSize(13); doc.text('Items by status', margin, y); y += 7;
      doc.setFontSize(10);
      data.byStatus.forEach(s => {
        if (y > 280) { doc.addPage(); y = margin; }
        doc.text(`${s.status}: ${s.count}`, margin, y); y += 6;
      });

      y += 4;
      if (y > 270) { doc.addPage(); y = margin; }
      doc.setFontSize(13); doc.text('Items posted by month', margin, y); y += 7;
      doc.setFontSize(10);
      data.monthlyItems.forEach(m => {
        if (y > 280) { doc.addPage(); y = margin; }
        doc.text(`${m.label} — posted: ${m.posted}, returned: ${m.returned}`, margin, y); y += 6;
      });

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="lostfound-report-${Date.now()}.pdf"`);
      return res.send(pdfBuffer);
    }

    return res.status(400).json({ message: 'format must be csv or pdf' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
