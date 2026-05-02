// models/LostReport.js
const mongoose = require('mongoose');

const lostReportSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  category:     { type: String, required: true },
  colour:       { type: String, default: '' },
  description:  { type: String, default: '' },
  lostLocation: { type: String, required: true },
  date:         { type: Date,   required: true },
  status:       { type: String, enum: ['searching', 'matched', 'resolved'], default: 'searching' },
  reportedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const LostReport = mongoose.model('LostReport', lostReportSchema);


// ─────────────────────────────────────────────────────────────


// models/Notification.js — loaded separately below
const notifSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:     { type: String, enum: ['claim', 'match', 'status', 'announcement', 'expiry'], required: true },
  title:    { type: String, required: true },
  message:  { type: String, required: true },
  itemId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
  read:     { type: Boolean, default: false }
}, { timestamps: true });

const Notification = mongoose.model('Notification', notifSchema);


// ─────────────────────────────────────────────────────────────


// models/Announcement.js
const announceSchema = new mongoose.Schema({
  title:    { type: String, required: true },
  body:     { type: String, required: true },
  priority: { type: String, enum: ['info', 'broadcast', 'urgent'], default: 'info' },
  audience: { type: String, enum: ['all', 'students', 'staff'], default: 'all' },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  views:    { type: Number, default: 0 }
}, { timestamps: true });

const Announcement = mongoose.model('Announcement', announceSchema);


// ─────────────────────────────────────────────────────────────


// models/Match.js
const matchSchema = new mongoose.Schema({
  foundItem:    { type: mongoose.Schema.Types.ObjectId, ref: 'Item',       required: true },
  lostReport:   { type: mongoose.Schema.Types.ObjectId, ref: 'LostReport', required: true },
  score:        { type: Number, required: true }, // 0-100
  status:       { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending' },
  confirmedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

const Match = mongoose.model('Match', matchSchema);


// ─────────────────────────────────────────────────────────────


// models/Claim.js
const claimSchema = new mongoose.Schema({
  itemId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  claimantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true },  // proof of ownership
  answers: [{
    question: { type: String, required: true },
    answer:   { type: String, required: true }
  }],
  status:      { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, { timestamps: true });

const Claim = mongoose.model('Claim', claimSchema);


// ─────────────────────────────────────────────────────────────


// models/Conversation.js — Chat threads
const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  itemId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
  lastMessage:  { type: String, default: '' },
  unread:       { type: Map, of: Number, default: {} }
}, { timestamps: true });

conversationSchema.index({ participants: 1 });
conversationSchema.index({ itemId: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);


// models/Message.js — Chat messages
const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body:           { type: String, default: '' },
  attachment: {
    url:  { type: String, default: '' },
    type: { type: String, default: '' } // image/*, application/pdf, etc.
  },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

messageSchema.index({ conversationId: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);


module.exports = { LostReport, Notification, Announcement, Match, Claim, Conversation, Message };
