const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db, q } = require('../db');
const limiter = require('../ratelimit');
const rt = require('../realtime');
const { signToken } = require('../auth');
const { pub, onUserCreated } = require('../util');

const USER_RE = /^[a-z][a-z0-9_]{2,19}$/;
const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'support', 'moderator', 'owner']);
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);
const session = (u) => ({ token: signToken(u), user: pub(u) });

router.get('/check-username', limiter({ windowMs: 60e3, max: 60 }), (req, res) => {
  const u = String(req.query.u || '').trim().toLowerCase();
  if (!USER_RE.test(u)) return res.json({ valid: false, available: false });
  const total = q('SELECT COUNT(*) AS n FROM users').get().n;
  const taken = q('SELECT 1 FROM users WHERE username = ?').get(u) || (total > 0 && RESERVED.has(u));
  res.json({ valid: true, available: !taken });
});

// open registration: ID + name + password (no email, no code). The first account becomes the owner.
router.post('/register', limiter({ windowMs: 3600e3, max: 30 }), (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase();
  const name = String(b.display_name || '').trim();
  const password = String(b.password || '');

  if (!USER_RE.test(username))
    return res.status(400).json({ error: 'آیدی باید ۳ تا ۲۰ کاراکتر باشد، با حرف انگلیسی شروع شود و فقط شامل حروف کوچک، عدد و _ باشد' });
  if (!name || name.length > 40) return res.status(400).json({ error: 'نام نمایشی باید بین ۱ تا ۴۰ کاراکتر باشد' });
  if (password.length < 6 || password.length > 72) return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });

  const total = q('SELECT COUNT(*) AS n FROM users').get().n;
  if (RESERVED.has(username) && total > 0) return res.status(409).json({ error: 'این آیدی در دسترس نیست' });
  if (q('SELECT 1 FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'این آیدی قبلاً گرفته شده است' });

  const hash = bcrypt.hashSync(password, 10);
  const create = db.transaction(() => {
    const count = q('SELECT COUNT(*) AS n FROM users').get().n;
    const info = q('INSERT INTO users (email, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`${username}@local.invalid`, username, name, hash, count === 0 ? 'owner' : 'user', Date.now());
    onUserCreated(info.lastInsertRowid);
    return info.lastInsertRowid;
  });

  let id;
  try { id = create(); } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'این آیدی قبلاً گرفته شده است' });
    throw e;
  }
  const user = q('SELECT * FROM users WHERE id = ?').get(id);
  rt.emitAll('user:new', { user: pub(user) });
  res.json(session(user));
});

router.post('/login', limiter({ windowMs: 600e3, max: 30 }), (req, res) => {
  const login = String(req.body?.login || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const u = q('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login);
  const ok = bcrypt.compareSync(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) return res.status(401).json({ error: 'آیدی یا رمز عبور اشتباه است' });
  if (u.banned) return res.status(403).json({ error: 'حساب شما مسدود شده است', code: 'banned' });
  res.json(session(u));
});

module.exports = router;
