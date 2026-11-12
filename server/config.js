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
  OWNER_EMAIL: (process.env.OWNER_EMAIL || '').trim().toLowerCase(),
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB) || 50,
  mail: {
    from: process.env.MAIL_FROM || '',
    resend: process.env.RESEND_API_KEY || '',
    brevo: process.env.BREVO_API_KEY || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT) || 587,
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      secure: process.env.SMTP_SECURE === 'true',
    },
  },
};
