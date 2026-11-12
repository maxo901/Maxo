const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, q } = require('../db');
const cfg = require('../config');
const mail = require('../mail');
const limiter = require('../ratelimit');
const rt = require('../realtime');
const { signToken } = require('../auth');
const { pub } = require('../util');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USER_RE = /^[a-z][a-z0-9_]{2,19}$/;
const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'support', 'moderator', 'owner']);
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

const normEmail = (v) => String(v || '').trim().toLowerCase();
const hashCode = (email, code) =>
  crypto.createHash('sha256').update(`${email}:${code}:${cfg.SECRET}`).digest('hex');
const session = (u) => ({ token: signToken(u), user: { ...pub(u), email: u.email } });

// 1) ask for an email code
router.post('/send-code', limiter({ windowMs: 3600e3, max: 12 }), async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!EMAIL_RE.test(email) || email.length > 120) return res.status(400).json({ error: 'ایمیل معتبر نیست' });
  if (q('SELECT 1 FROM users WHERE email = ?').get(email))
    return res.status(409).json({ error: 'این ایمیل قبلاً ثبت‌نام کرده است' });

  const prev = q('SELECT sent_at FROM email_codes WHERE email = ?').get(email);
  if (prev && Date.now() - prev.sent_at < 60000)
    return res.status(429).json({ error: 'لطفاً یک دقیقه صبر کنید و دوباره تلاش کنید' });

  const code = String(crypto.randomInt(100000, 1000000));
  const now = Date.now();
  q(`INSERT INTO email_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
                                      attempts = 0, sent_at = excluded.sent_at`)
    .run(email, hashCode(email, code), now + 10 * 60000, now);

  try {
    await mail.sendCode(email, code);
    res.json({ ok: true });
  } catch (e) {
    console.error('[mail error]', e.message);
    q('DELETE FROM email_codes WHERE email = ?').run(email);
    res.status(502).json({ error: 'ارسال ایمیل ناموفق بود. تنظیمات ایمیل سرور را بررسی کنید' });
  }
});

// live "is this ID free?" check
router.get('/check-username', limiter({ windowMs: 60e3, max: 60 }), (req, res) => {
  const u = String(req.query.u || '').trim().toLowerCase();
  if (!USER_RE.test(u)) return res.json({ valid: false, available: false });
  const total = q('SELECT COUNT(*) AS n FROM users').get().n;
  const taken = q('SELECT 1 FROM users WHERE username = ?').get(u) || (total > 0 && RESERVED.has(u));
  res.json({ valid: true, available: !taken });
});

// 2) verify code + create account
router.post('/register', limiter({ windowMs: 900e3, max: 30 }), (req, res) => {
  const b = req.body || {};
  const email = normEmail(b.email);
  const username = String(b.username || '').trim().toLowerCase();
  const name = String(b.display_name || '').trim();
  const password = String(b.password || '');
  const code = String(b.code || '').trim();

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'ایمیل معتبر نیست' });
  if (!USER_RE.test(username))
    return res.status(400).json({ error: 'آیدی باید ۳ تا ۲۰ کاراکتر باشد، با حرف انگلیسی شروع شود و فقط شامل حروف کوچک، عدد و _ باشد' });
  if (!name || name.length > 40) return res.status(400).json({ error: 'نام نمایشی باید بین ۱ تا ۴۰ کاراکتر باشد' });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'رمز عبور باید حداقل ۸ کاراکتر باشد' });

  const total = q('SELECT COUNT(*) AS n FROM users').get().n;
  if (RESERVED.has(username) && total > 0) return res.status(409).json({ error: 'این آیدی در دسترس نیست' });
  if (q('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'این ایمیل قبلاً ثبت‌نام کرده است' });
  if (q('SELECT 1 FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'این آیدی قبلاً گرفته شده است' });

  const rec = q('SELECT * FROM email_codes WHERE email = ?').get(email);
  if (!rec || rec.expires_at < Date.now()) return res.status(400).json({ error: 'کد منقضی شده است، کد جدید دریافت کنید' });
  if (rec.attempts >= 5) return res.status(429).json({ error: 'تعداد تلاش‌ها زیاد بود، کد جدید دریافت کنید' });

  const given = Buffer.from(hashCode(email, code));
  const real = Buffer.from(rec.code_hash);
  if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) {
    q('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?').run(email);
    return res.status(400).json({ error: 'کد تأیید اشتباه است' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const create = db.transaction(() => {
    const count = q('SELECT COUNT(*) AS n FROM users').get().n;
    const isOwner = cfg.OWNER_EMAIL ? email === cfg.OWNER_EMAIL : count === 0;
    const info = q(
      `INSERT INTO users (email, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(email, username, name, passwordHash, isOwner ? 'owner' : 'user', Date.now());
    q('DELETE FROM email_codes WHERE email = ?').run(email);
    return info.lastInsertRowid;
  });

  let id;
  try {
    id = create();
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'ایمیل یا آیدی قبلاً ثبت شده است' });
    throw e;
  }
  const user = q('SELECT * FROM users WHERE id = ?').get(id);
  rt.emitAll('user:new', { user: pub(user) });
  res.json(session(user));
});

router.post('/login', limiter({ windowMs: 600e3, max: 30 }), (req, res) => {
  const login = String(req.body?.login || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const u = q('SELECT * FROM users WHERE email = ? OR username = ?').get(login, login);
  const ok = bcrypt.compareSync(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) return res.status(401).json({ error: 'ایمیل/آیدی یا رمز عبور اشتباه است' });
  if (u.banned) return res.status(403).json({ error: 'حساب شما مسدود شده است', code: 'banned' });
  res.json(session(u));
});

module.exports = router;
