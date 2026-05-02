const cron = require('node-cron');
const Item = require('../models/Item');
const User = require('../models/User');
const { Notification } = require('../models/OtherModels');

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function notifyUser(userId, title, message, itemId) {
  await Notification.create({
    userId,
    type: 'expiry',
    title,
    message,
    itemId: itemId || null,
    read: false,
  });
}

module.exports = function startExpiryCron(io) {
  // Runs daily at 02:00 server time
  cron.schedule('0 2 * * *', async () => {
    try {
      const now = new Date();
      const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      // 25+ days old and still found => reminder
      const reminderCutoff = daysAgo(25);
      const reminderItems = await Item.find({
        status: 'found',
        archived: { $ne: true },
        createdAt: { $lte: reminderCutoff },
      }).limit(200);

      for (const item of reminderItems) {
        // Remind only if expires within next 5 days
        if (item.expiresAt && (item.expiresAt > fiveDaysFromNow || item.expiresAt < now)) continue;
        await notifyUser(
          item.postedBy,
          'Listing expiring soon',
          `Your listing "${item.name}" will expire soon. You can renew it from your dashboard.`,
          item._id
        );
        io.to(item.postedBy.toString()).emit('expiry:reminder', { itemId: item._id, message: 'Listing expiring soon' });
      }

      // 30+ days old and still found => expire
      const expireCutoff = daysAgo(30);
      await Item.updateMany(
        { status: 'found', archived: { $ne: true }, createdAt: { $lte: expireCutoff } },
        { $set: { status: 'expired' } }
      );

      // 60+ days old => archive (regardless of found/expired)
      const archiveCutoff = daysAgo(60);
      await Item.updateMany(
        { archived: { $ne: true }, createdAt: { $lte: archiveCutoff } },
        { $set: { archived: true, status: 'archived' } }
      );

      // Notify admins (system health)
      const admins = await User.find({ role: 'admin' }, '_id');
      admins.forEach(a => {
        io.to(a._id.toString()).emit('system:cron', { message: 'Expiry cron ran successfully' });
      });
      // eslint-disable-next-line no-console
      console.log('⏰ Expiry cron completed');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('⏰ Expiry cron error:', err.message);
    }
  });
};

