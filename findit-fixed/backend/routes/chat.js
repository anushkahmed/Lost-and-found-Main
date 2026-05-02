// routes/chat.js — secure in-app messaging.
//
// Hardening:
//   • All ObjectIds (params + body.recipientId) are validated.
//   • `protect` enforces conversation membership before reading/writing.
//   • Chat attachments are NOT served from the public /uploads mount.
//     Instead, files live in `uploads/chat-private/` and are downloaded via
//     `GET /api/chat/file/:messageId` which re-checks conversation membership.
//   • Filenames are random hex (no original name → no path traversal).
//   • MIME allowlist + magic-byte verification for chat uploads (images +
//     a small allowlist of document types).
//   • `recipientId` matched against a real existing user before insert.

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FileType = require('file-type');
const validator = require('validator');

const { Conversation, Message } = require('../models/OtherModels');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { requireObjectId, parsePagination, isObjectId } = require('../middleware/security');
const { uploadLimiter } = require('../middleware/rateLimiters');

// Private folder — never mounted via express.static.
const CHAT_UPLOAD_DIR = path.join('uploads', 'chat-private');
if (!fs.existsSync(CHAT_UPLOAD_DIR)) fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });

// MIME allowlist for chat (slightly broader than item images).
const CHAT_ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
]);

const safeExt = (originalname) => {
  const ext = path.extname(originalname || '').toLowerCase();
  if (!ext || ext.length > 6 || /[^.a-z0-9]/.test(ext.replace('.', ''))) return '';
  return ext;
};

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CHAT_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(16).toString('hex');
    cb(null, `${id}${safeExt(file.originalname) || '.bin'}`);
  }
});

const uploadChat = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!CHAT_ALLOWED_MIMES.has(file.mimetype)) return cb(new Error('Unsupported file type'));
    cb(null, true);
  }
});

async function verifyChatMagicBytes(req, res, next) {
  if (!req.file) return next();
  try {
    const detected = await FileType.fromFile(req.file.path);
    if (!detected || !CHAT_ALLOWED_MIMES.has(detected.mime)) {
      fs.unlink(req.file.path, () => {});
      return res.status(415).json({ message: 'File contents do not match an allowed type.' });
    }
    req.file.detectedMime = detected.mime;
    next();
  } catch (e) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: 'Could not verify file contents' });
  }
}

function clampUnread(n) {
  const x = Number(n) || 0;
  return Math.max(0, Math.min(999, x));
}

// Strip <,> from text bodies as a last-defense against rendering issues.
// (React already escapes by default; this is belt-and-braces.)
const sanitizeText = (s) => validator.stripLow(String(s || ''), true).slice(0, 4000);

// GET /api/chat/conversations — list my conversations
router.get('/conversations', protect, asyncHandler(async (req, res) => {
  const me = req.user._id;
  const conversations = await Conversation.find({ participants: me })
    .sort({ updatedAt: -1 })
    .populate('participants', 'name email role profilePicture verifiedBadge trustScore active')
    .populate('itemId', 'name category images isHighValue highValueApproved status');

  const mapped = conversations.map(c => {
    const unreadForMe = clampUnread(c.unread?.get?.(me.toString()) ?? c.unread?.[me.toString()] ?? 0);
    return { ...c.toObject(), unreadForMe };
  });
  res.json(mapped);
}));

// POST /api/chat/conversations — find or create
router.post('/conversations', protect, asyncHandler(async (req, res) => {
  const me = req.user._id;
  const recipientId = req.body.recipientId;
  const itemId = req.body.itemId || null;

  if (!isObjectId(recipientId)) {
    return res.status(400).json({ message: 'Valid recipientId is required' });
  }
  if (recipientId === me.toString()) {
    return res.status(400).json({ message: 'Cannot create conversation with yourself' });
  }
  if (itemId && !isObjectId(itemId)) {
    return res.status(400).json({ message: 'Invalid itemId' });
  }

  const recipient = await User.findById(recipientId).select('_id active');
  if (!recipient || recipient.active === false) {
    return res.status(404).json({ message: 'Recipient not available' });
  }

  const query = {
    participants: { $all: [me, recipientId] },
    ...(itemId ? { itemId } : { itemId: null }),
  };

  let convo = await Conversation.findOne(query);
  if (!convo) {
    convo = await Conversation.create({
      participants: [me, recipientId],
      itemId: itemId || null,
      unread: { [me.toString()]: 0, [recipientId.toString()]: 0 }
    });
  }

  const populated = await Conversation.findById(convo._id)
    .populate('participants', 'name email role profilePicture verifiedBadge trustScore active')
    .populate('itemId', 'name category images isHighValue highValueApproved status');

  res.status(201).json(populated);
}));

// GET /api/chat/conversations/:id/messages — paginated
router.get('/conversations/:id/messages', protect, requireObjectId('id'), asyncHandler(async (req, res) => {
  const me = req.user._id;
  const { page, limit, skip } = parsePagination(req, { defaultLimit: 30, maxLimit: 100 });
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).json({ message: 'Conversation not found' });
  const isMember = convo.participants.some(p => p.toString() === me.toString());
  if (!isMember) return res.status(403).json({ message: 'Not allowed' });

  const total = await Message.countDocuments({ conversationId: convo._id });
  const messages = await Message.find({ conversationId: convo._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('senderId', 'name profilePicture verifiedBadge');

  res.json({
    messages: messages.reverse(),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}));

// POST /api/chat/conversations/:id/messages — send message
router.post(
  '/conversations/:id/messages',
  protect,
  requireObjectId('id'),
  uploadLimiter,
  uploadChat.single('file'),
  verifyChatMagicBytes,
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const convo = await Conversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    const isMember = convo.participants.some(p => p.toString() === me.toString());
    if (!isMember) {
      // Clean up the file we just wrote — they can't have it.
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ message: 'Not allowed' });
    }

    const body = sanitizeText(req.body.body);
    const file = req.file;
    if (!body && !file) {
      return res.status(400).json({ message: 'Message body or file is required' });
    }

    // Store ONLY the local filename — never an absolute or relative path. We
    // resolve to the private directory on download.
    const attachmentName = file ? path.basename(file.path) : '';
    const attachmentType = file?.detectedMime || file?.mimetype || '';

    const msg = await Message.create({
      conversationId: convo._id,
      senderId: me,
      body,
      // We keep the original `attachment.url` field shape for client compat:
      // emit a SIGNED API URL, not a static /uploads path.
      attachment: { url: attachmentName ? `/api/chat/file/${attachmentName}` : '', type: attachmentType },
      readBy: [me]
    });

    convo.lastMessage = body || (attachmentType.startsWith('image/') ? '📷 Photo' : '📎 Attachment');
    const unread = convo.unread || new Map();
    convo.participants.forEach(p => {
      const key = p.toString();
      if (key === me.toString()) return;
      const prev = clampUnread(unread.get?.(key) ?? unread[key] ?? 0);
      if (typeof unread.set === 'function') unread.set(key, prev + 1);
      else unread[key] = prev + 1;
    });
    convo.unread = unread;
    await convo.save();

    const populatedMsg = await Message.findById(msg._id).populate('senderId', 'name profilePicture verifiedBadge');

    convo.participants.forEach(p => {
      const id = p.toString();
      if (id === me.toString()) return;
      req.io.to(id).emit('chat:message', { conversationId: convo._id, message: populatedMsg });
    });

    res.status(201).json(populatedMsg);
  })
);

// PUT /api/chat/conversations/:id/read — mark conversation read for me
router.put('/conversations/:id/read', protect, requireObjectId('id'), asyncHandler(async (req, res) => {
  const me = req.user._id;
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).json({ message: 'Conversation not found' });
  const isMember = convo.participants.some(p => p.toString() === me.toString());
  if (!isMember) return res.status(403).json({ message: 'Not allowed' });

  if (!convo.unread) convo.unread = new Map();
  if (typeof convo.unread.set === 'function') convo.unread.set(me.toString(), 0);
  else convo.unread[me.toString()] = 0;

  await convo.save();
  res.json({ message: 'Marked as read' });
}));

// GET /api/chat/file/:filename — gated download for chat attachments.
// Authorization: caller must be a participant in a conversation that contains
// a Message whose attachment.url ends with this filename.
router.get('/file/:filename', protect, asyncHandler(async (req, res) => {
  const filename = req.params.filename;
  // Reject anything that would break out of the directory (defence in depth — we
  // only generated random hex names, but never trust input).
  if (!/^[a-f0-9]{32}\.[a-z0-9]{1,6}$/i.test(filename)) {
    return res.status(400).json({ message: 'Invalid filename' });
  }

  const expectedUrl = `/api/chat/file/${filename}`;
  const msg = await Message.findOne({ 'attachment.url': expectedUrl }).select('conversationId attachment');
  if (!msg) return res.status(404).json({ message: 'File not found' });

  const convo = await Conversation.findById(msg.conversationId).select('participants');
  if (!convo) return res.status(404).json({ message: 'File not found' });
  const me = req.user._id.toString();
  const isMember = convo.participants.some(p => p.toString() === me);
  if (!isMember) return res.status(403).json({ message: 'Not allowed' });

  const filePath = path.join(CHAT_UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File missing' });

  res.setHeader('Content-Type', msg.attachment.type || 'application/octet-stream');
  // Force download for non-image types so risky content can't be inlined / executed.
  if (!String(msg.attachment.type).startsWith('image/')) {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
  res.sendFile(path.resolve(filePath));
}));

module.exports = router;
