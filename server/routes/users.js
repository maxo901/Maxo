const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { q } = require('../db');
const rt = require('../realtime');
const { ownerOnly } = require('../auth');
const { avatarUpload, removeFile } = require('../upload');
const { pub, toId } = require('../util');

const byId = (id) => q('SELECT * FROM users WHERE id = ?').get(id);
const meView = (u) => ({ ...pub(u), email: u.email });

router.get('/me', (req, res) => res.json(meView(req.user)));

router.patch('/me', (req, res) => {
  const name = String(req.body?.display_name ?? req.user.display_name).trim();
  const bio = String(req.body?.bio ?? req.user.bio).trim();
  if (!name || name.length > 40) return res.status(400).json({ error: 'نام نمایشی باید بین ۱ تا ۴۰ کاراکتر باشد' });
  if (bio.length > 160) return res.status(400).json({ error: 'بیوگرافی حداکثر ۱۶۰ کاراکتر است' });
  q('UPDATE users SET display_name = ?, bio = ? WHERE id = ?').run(name, bio, req.user.id);
  const u = byId(req.user.id);
  rt.emitAll('user:update', { user: pub(u) });
  res.json(meView(u));
});

router.post('/me/avatar', avatarUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'تصویری انتخاب نشده است' });
  const old = req.user.avatar;
  q('UPDATE users SET avatar = ? WHERE id = ?').run('/uploads/' + req.file.filename, req.user.id);
  removeFile(old);
  const u = byId(req.user.id);
  rt.emitAll('user:update', { user: pub(u) });
  res.json(meView(u));
});

router.delete('/me/avatar', (req, res) => {
  removeFile(req.user.avatar);
  q('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  const u = byId(req.user.id);
  rt.emitAll('user:update', { user: pub(u) });
  res.json(meView(u));
});

router.delete('/me', (req, res) => {
  const u = req.user;
  if (u.role === 'owner') return res.status(400).json({ error: 'مالک نمی‌تواند حساب خود را حذف کند' });
  if (!bcrypt.compareSync(String(req.body?.password || ''), u.password_hash))
    return res.status(403).json({ error: 'رمز عبور اشتباه است' });

  // files that live in this user's private chats go away with the chats
  q(`SELECT m.file_url AS f FROM messages m JOIN chats c ON c.id = m.chat_id
     WHERE c.type = 'dm' AND (c.user_a = ? OR c.user_b = ?) AND m.file_url IS NOT NULL`)
    .all(u.id, u.id)
    .forEach((r) => removeFile(r.f));
  removeFile(u.avatar);

  // cascades: DM chats + their messages, reactions, read marks. Group messages stay (sender -> null).
  q('DELETE FROM users WHERE id = ?').run(u.id);
  rt.disconnectUser(u.id);
  rt.emitAll('user:delete', { id: u.id });
  res.json({ ok: true });
});

router.get('/users', (req, res) => {
  const owner = req.user.role === 'owner';
  const rows = q('SELECT * FROM users ORDER BY display_name COLLATE NOCASE')
    .all()
    .filter((u) => owner || !u.banned || u.id === req.user.id);
  res.json({ users: rows.map(pub) });
});

router.get('/users/:id', (req, res) => {
  const u = byId(toId(req.params.id));
  if (!u || (u.banned && req.user.role !== 'owner')) return res.status(404).json({ error: 'کاربر پیدا نشد' });
  res.json({ user: pub(u) });
});

router.post('/users/:id/ban', ownerOnly, (req, res) => {
  const t = byId(toId(req.params.id));
  if (!t) return res.status(404).json({ error: 'کاربر پیدا نشد' });
  if (t.role === 'owner') return res.status(400).json({ error: 'مالک را نمی‌توان مسدود کرد' });
  const banned = req.body?.banned ? 1 : 0;
  q('UPDATE users SET banned = ? WHERE id = ?').run(banned, t.id);
  if (banned) rt.disconnectUser(t.id);
  const u = pub(byId(t.id));
  rt.emitAll('user:update', { user: u });
  res.json({ user: u });
});

module.exports = router;
