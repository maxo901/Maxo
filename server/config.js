const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, 'secret.key');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

module.exports = {
  PORT: Number(process.env.PORT) || 8080,
  DATA_DIR,
  UPLOADS_DIR,
  SECRET: loadSecret(),
  APP_NAME: process.env.APP_NAME || 'پیام‌رسان',
  // Who becomes the owner: OWNER_USERNAME, or (legacy) OWNER_EMAIL, or the very first account.
  OWNER_USERNAME: (process.env.OWNER_USERNAME || '').trim().toLowerCase(),
  OWNER_EMAIL: (process.env.OWNER_EMAIL || '').trim().toLowerCase(),
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB) || 50,
  STORY_TTL_MS: 24 * 3600 * 1000,
};
