const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db, q } = require('../db');
const cfg = require('../config');
const limiter = require('../ratelimit');
const rt = require('../realtime');
const { signToken } = require('../auth');
const { pub, ensureSaved } = require('../util');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USER_RE = /^[a-z][a-z0-9_]{2,19}$/;
const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'support', 'moderator', 'owner']);
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

const normEmail = (v) => String(v || '').trim().toLowerCase();
const session = (u) => ({ token: signToken(u), user: { ...pub(u, u.id), email: u.email } });

// live "is this ID free?" check
router.get('/check-username', limiter({ windowMs: 60e3, max: 60 }), (req, res) => {
  const u = String(req.query.u || '').trim().toLowerCase();
  if (!USER_RE.test(u)) return res.json({ valid: false, available: false });
  const total = q('SELECT COUNT(*) AS n FROM users').get().n;
  const taken = q('SELECT 1 FROM users WHERE username = ?').get(u) || (total > 0 && RESERVED.has(u));
  res.json({ valid: true, available: !taken });
});

// Sign-up: no e-mail code any more. E-mail is optional.
router.post('/register', limiter({ windowMs: 3600e3, max: 40 }), (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase();
  const name = String(b.display_name || '').trim();
  const password = String(b.password || '');
  let email = normEmail(b.email);

  if (!USER_RE.test(username)) return res.status(400).json({ error: 'e.bad_username' });
  if (!name || name.length > 40) return res.status(400).json({ error: 'e.bad_name' });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'e.bad_password' });
  if (email && (!EMAIL_RE.test(email) || email.length > 120)) return res.status(400).json({ error: 'e.bad_email' });
  if (!email) email = `${username}@users.local`;

  const total = q('SELECT COUNT(*) AS n FROM users').get().n;
  if (RESERVED.has(username) && total > 0) return res.status(409).json({ error: 'e.username_taken' });
  if (q('SELECT 1 FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'e.username_taken' });
  if (q('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'e.email_taken' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const create = db.transaction(() => {
    const count = q('SELECT COUNT(*) AS n FROM users').get().n;
    const isOwner = cfg.OWNER_USERNAME ? username === cfg.OWNER_USERNAME : cfg.OWNER_EMAIL ? email === cfg.OWNER_EMAIL : count === 0;
    const info = q(
      `INSERT INTO users (email, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(email, username, name, passwordHash, isOwner ? 'owner' : 'user', Date.now());
    const id = info.lastInsertRowid;
    // everybody (also people who sign up later) is a member of every owner-made group
    q(`INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at)
       SELECT id, ?, ?, ? FROM chats WHERE type = 'group' AND official = 1`).run(id, isOwner ? 'admin' : 'member', Date.now());
    ensureSaved(id);
    return id;
  });

  let id;
  try {
    id = create();
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'e.username_taken' });
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
  if (!u || !ok) return res.status(401).json({ error: 'e.login_failed' });
  if (u.banned) return res.status(403).json({ error: 'e.banned', code: 'banned' });
  res.json(session(u));
});

module.exports = router;
