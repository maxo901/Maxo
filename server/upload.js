const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { UPLOADS_DIR, MAX_UPLOAD_MB } = require('./config');

// Only these types keep a real extension. Everything else is stored as .bin and
// served as a download, so an uploaded .html/.svg can never run on our origin.
const EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'audio/webm': '.weba', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/mpeg': '.mp3',
  'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/aac': '.aac',
};

const baseMime = (m = '') => String(m).split(';')[0].trim().toLowerCase();

function kindOf(mime) {
  const m = baseMime(mime);
  if (!EXT[m]) return 'file';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return 'voice';
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) =>
    cb(null, crypto.randomBytes(16).toString('hex') + (EXT[baseMime(file.mimetype)] || '.bin')),
});

const mediaUpload = multer({ storage, limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });

const imageOnly = (req, file, cb) => {
  if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(baseMime(file.mimetype))) return cb(null, true);
  const err = new Error('e.image_only');
  err.status = 400;
  cb(err);
};
const avatarUpload = multer({ storage, limits: { fileSize: 3 * 1024 * 1024, files: 1 }, fileFilter: imageOnly });
const wallpaperUpload = multer({ storage, limits: { fileSize: 6 * 1024 * 1024, files: 1 }, fileFilter: imageOnly });

function removeFile(url) {
  if (!url || !String(url).startsWith('/uploads/')) return;
  fs.unlink(path.join(UPLOADS_DIR, path.basename(url)), () => {});
}

module.exports = { mediaUpload, avatarUpload, wallpaperUpload, kindOf, baseMime, removeFile };
