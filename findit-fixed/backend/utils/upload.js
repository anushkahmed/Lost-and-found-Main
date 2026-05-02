// utils/upload.js — hardened multer factories.
//
// Why this exists:
//   • The previous setup validated only the ORIGINAL filename extension.
//     Renaming evil.html → evil.png trivially bypassed that check.
//   • Filenames came from the user (`Date.now() + originalname.ext`) →
//     predictable + susceptible to path traversal if a future change ever
//     used originalname directly.
//   • SVG was implicitly accepted via `image/*` and can carry inline JS.
//
// Hardening:
//   • Filenames = `crypto.randomBytes(16).toString('hex') + .ext`.
//   • Only an explicit allowlist of MIME / extension pairs is accepted.
//   • After multer writes the file, we re-check magic bytes with `file-type`
//     and unlink+reject anything that doesn't match.

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// `file-type` v16 is the last CJS line; v17+ is ESM-only and would force a dynamic import
const FileType = require('file-type');

const ALLOWED_IMAGES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function safeExt(originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  if (!ext || ext.length > 6 || /[^.a-z0-9]/.test(ext.replace('.', ''))) return '';
  return ext;
}

function makeImageStorage(subdir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join('uploads', subdir);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = ALLOWED_IMAGES[file.mimetype] || safeExt(file.originalname) || '.bin';
      const id = crypto.randomBytes(16).toString('hex');
      cb(null, `${id}${ext}`);
    },
  });
}

function imageFileFilter(req, file, cb) {
  const ext = safeExt(file.originalname);
  const mimeOk = Object.prototype.hasOwnProperty.call(ALLOWED_IMAGES, file.mimetype);
  const extOk = Object.values(ALLOWED_IMAGES).includes(ext);
  if (!mimeOk || !extOk) return cb(new Error('Images only'));
  cb(null, true);
}

// After multer writes the file we verify magic bytes match the claimed image kind.
// If they don't, delete the file and 415 the request.
async function verifyMagicBytesMiddleware(req, res, next) {
  const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : (req.file ? [req.file] : []);
  for (const f of files) {
    try {
      const detected = await FileType.fromFile(f.path);
      const okMime = detected && Object.prototype.hasOwnProperty.call(ALLOWED_IMAGES, detected.mime);
      if (!okMime) {
        fs.unlink(f.path, () => {});
        return res.status(415).json({ message: 'File contents do not match an allowed image type.' });
      }
    } catch (e) {
      fs.unlink(f.path, () => {});
      return res.status(400).json({ message: 'Could not verify file contents' });
    }
  }
  next();
}

function makeImageUpload(subdir, { maxBytes = 5 * 1024 * 1024 } = {}) {
  return multer({
    storage: makeImageStorage(subdir),
    limits: { fileSize: maxBytes, files: 5 },
    fileFilter: imageFileFilter,
  });
}

module.exports = {
  makeImageUpload,
  verifyMagicBytesMiddleware,
  ALLOWED_IMAGES,
};
