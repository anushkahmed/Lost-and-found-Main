// models/Item.js
const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  // Basic Info
  name: {
    type: String,
    required: [true, 'Item name is required'],
    trim: true
  },
  category: {
    type: String,
    required: true
  },
  colour: {
    type: String,
    default: ''
  },
  brand: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },

  // Location & Date
  foundLocation: {
    type: String,
    required: [true, 'Found location is required']
  },
  // Optional pin-drop on a map. lat/lng kept null when poster doesn't drop a pin.
  coordinates: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  storageLocation: {
    type: String,
    default: 'Security Office'
  },
  date: {
    type: Date,
    required: [true, 'Date found is required']
  },

  // Status
  status: {
    type: String,
    enum: ['found', 'claimed', 'returned', 'expired', 'archived'],
    default: 'found'
  },

  // Images (file paths)
  images: [{ type: String }],

  // High-value workflow
  isHighValue: {
    type: Boolean,
    default: false
  },
  highValueApproved: {
    type: Boolean,
    default: false
  },

  // Ownership verification questions (poster-defined)
  ownershipQuestions: [{
    question: { type: String, required: true }
  }],

  // Expiry / archive
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  },
  archived: {
    type: Boolean,
    default: false
  },
  renewedAt: {
    type: Date,
    default: null
  },

  // Who posted this item
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Matched lost report (if any)
  matchedWith: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LostReport',
    default: null
  }

}, { timestamps: true });

// Create text index for search
itemSchema.index({ name: 'text', description: 'text', foundLocation: 'text' });

module.exports = mongoose.model('Item', itemSchema);
