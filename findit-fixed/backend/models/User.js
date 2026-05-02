// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12; // raised from 10 — slightly stronger against offline cracking

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: 80
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    maxlength: 254
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 10,
    // Defense in depth: never serialise the hash unless explicitly requested
    // with `.select('+password')`.
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  phone: {
    type: String,
    default: '',
    maxlength: 32
  },

  // Profile + safety
  profilePicture: {
    type: String,
    default: ''
  },
  active: {
    type: Boolean,
    default: true
  },
  deactivatedAt: {
    type: Date,
    default: null
  },

  // Reputation
  trustScore: {
    type: Number,
    default: 50,
    min: 0,
    max: 100
  },
  verifiedBadge: {
    type: Boolean,
    default: false
  },

  // Gamification — reward points (separate from trust score)
  points: {
    type: Number,
    default: 0,
    min: 0
  },

  // Two-factor authentication (TOTP)
  // The secret is stored encrypted at rest using utils/crypto.js (AES-256-GCM).
  twoFactorSecret: {
    type: String,
    default: '',
    select: false
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },

  // Brute-force lockout (per-account).  Increments on bad password; cleared on success.
  failedLoginAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  lockedUntil: {
    type: Date,
    default: null,
    select: false
  },

  // Refresh-token versioning. `logout` increments this so every refresh JWT
  // currently in the wild becomes invalid (centralised revocation without a denylist).
  tokenVersion: {
    type: Number,
    default: 0,
    select: false
  },

  // Password reset (token stored hashed; raw token only emailed)
  passwordResetToken: { type: String, default: '', select: false },
  passwordResetExpires: { type: Date, default: null, select: false }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
  next();
});

// Compare password (requires .select('+password') on the find)
userSchema.methods.matchPassword = async function(enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.isLocked = function() {
  return !!(this.lockedUntil && this.lockedUntil.getTime() > Date.now());
};

module.exports = mongoose.model('User', userSchema);
