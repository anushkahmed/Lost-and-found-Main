// models/Phase2Models.js — adds ItemHistory + AbuseReport without touching existing models
const mongoose = require('mongoose');

// Audit trail for any status / lifecycle change on an Item
const itemHistorySchema = new mongoose.Schema({
  itemId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Item',  required: true },
  changedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',  default: null },
  action:      { type: String, required: true },            // e.g. 'created','status:claimed','renewed','approved'
  fromStatus:  { type: String, default: '' },
  toStatus:    { type: String, default: '' },
  meta:        { type: Object, default: {} }
}, { timestamps: true });

itemHistorySchema.index({ itemId: 1, createdAt: -1 });

const ItemHistory = mongoose.model('ItemHistory', itemHistorySchema);


// Abuse / fake-listing reports
const abuseSchema = new mongoose.Schema({
  reporterId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType:    { type: String, enum: ['item', 'user'], required: true },
  targetItemId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
  targetUserId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reason:        { type: String, required: true },
  details:       { type: String, default: '' },
  status:        { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
  resolvedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolutionNote:{ type: String, default: '' }
}, { timestamps: true });

abuseSchema.index({ status: 1, createdAt: -1 });

const AbuseReport = mongoose.model('AbuseReport', abuseSchema);


// Dynamic categories (replaces hardcoded enum)
const categorySchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true, trim: true, maxlength: 60 },
  icon:        { type: String, default: '📦', maxlength: 10 },
  description: { type: String, default: '', maxlength: 200 },
  active:      { type: Boolean, default: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

categorySchema.index({ name: 1 });
const Category = mongoose.model('Category', categorySchema);


// User feedback / rating after item return
const feedbackSchema = new mongoose.Schema({
  fromUser:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUser:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  itemId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  rating:     { type: Number, required: true, min: 1, max: 5 },
  comment:    { type: String, default: '', maxlength: 500 },
  type:       { type: String, enum: ['finder', 'claimer'], required: true } // who is being rated
}, { timestamps: true });

feedbackSchema.index({ toUser: 1, createdAt: -1 });
feedbackSchema.index({ fromUser: 1, itemId: 1 }, { unique: true }); // one feedback per user per item
const Feedback = mongoose.model('Feedback', feedbackSchema);


// System log entries (stored in DB for admin viewing)
const systemLogSchema = new mongoose.Schema({
  level:     { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
  action:    { type: String, required: true },
  message:   { type: String, required: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  meta:      { type: Object, default: {} },
  ip:        { type: String, default: '' }
}, { timestamps: true });

systemLogSchema.index({ createdAt: -1 });
systemLogSchema.index({ level: 1, createdAt: -1 });
const SystemLog = mongoose.model('SystemLog', systemLogSchema);


module.exports = { ItemHistory, AbuseReport, Category, Feedback, SystemLog };
