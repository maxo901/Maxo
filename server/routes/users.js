const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { q } = require('../db');
const rt = require('../realtime');
const { ownerOnly } = require('../auth');
const { avatarUpload } = require('../upload');
const { pub, toId, audience, releaseFile } = require('../util');

const byId = (id) => q('SELECT * FROM users WHERE id = ?').get(id);
const meView = (u) => ({ ...pub(u), last_seen: u.last_seen, show_online: u.show_online !== 0 });
const push = (u) => rt.emitAll('user:update', { user: pub(u) });

router.get('/me', (req, res) => res.json(meView(req.user)));

router.patch('/me', (req, res) => {
  const b = req.body || {};
  const name = String(b.display_name ?? req.user.display_name).trim();
  const bio = String(b.bio ?? req.user.bio).trim();
  const show = b.show_online === undefined ? req.user.show_online : b.show_online ? 1 : 0;
  if (!name || name.length > 40) return res.status(400).json({ error: 'نام نمایشی باید بین ۱ تا ۴۰ کاراکتر باشد' });
  if (bio.length > 160) return res.status(400).json({ error: 'بیوگرافی حداکثر ۱۶۰ کاراکتر است' });
  q('UPDATE users SET display_name = ?, bio = ?, show_online = ? WHERE id = ?').run(name, bio, show, req.user.id);
  if (show !== req.user.show_online) rt.setVisibility(req.user.id);
  const u = byId(req.user.id);
  push(u);
  res.json(meView(u));
});

router.post('/me/password', (req, res) => {
  const { current, next } = req.body || {};
  if (!bcrypt.compareSync(String(current || ''), req.user.password_hash)) return res.status(403).json({ error: 'رمز عبور اشتباه است' });
  const pw = String(next || '');
  if (pw.length < 6 || pw.length > 72) return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });
  q('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(pw, 10), req.user.id);
  res.json({ ok: true });
});

router.post('/me/avatar', avatarUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'تصویری انتخاب نشده است' });
  const old = req.user.avatar;
  q('UPDATE users SET avatar = ? WHERE id = ?').run('/uploads/' + req.file.filename, req.user.id);
  releaseFile(old);
  const u = byId(req.user.id);
  push(u);
  res.json(meView(u));
});

router.delete('/me/avatar', (req, res) => {
  const old = req.user.avatar;
  q('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  releaseFile(old);
  const u = byId(req.user.id);
  push(u);
  res.json(meView(u));
});

router.delete('/me', (req, res) => {
  const u = req.user;
  if (u.role === 'owner') return res.status(400).json({ error: 'مالک نمی‌تواند حساب خود را حذف کند' });
  if (!bcrypt.compareSync(String(req.body?.password || ''), u.password_hash)) return res.status(403).json({ error: 'رمز عبور اشتباه است' });

  const files = [u.avatar];
  q('SELECT file_url FROM stories WHERE user_id = ?').all(u.id).forEach((r) => files.push(r.file_url));
  q(`SELECT m.file_url AS f FROM messages m JOIN chats c ON c.id = m.chat_id
     WHERE c.type IN ('dm','saved') AND (c.user_a = ? OR c.user_b = ?) AND m.file_url IS NOT NULL`).all(u.id, u.id).forEach((r) => files.push(r.f));

  // groups/channels created by this user are removed with the account
  const mine = q("SELECT * FROM chats WHERE type IN ('group','channel') AND created_by = ?").all(u.id);
  for (const c of mine) {
    rt.emitToUsers(audience(c), 'chat:delete', { id: c.id });
    q('SELECT file_url FROM messages WHERE chat_id = ? AND file_url IS NOT NULL').all(c.id).forEach((r) => files.push(r.file_url));
    files.push(c.avatar);
    q('DELETE FROM chats WHERE id = ?').run(c.id);
  }
  q('DELETE FROM users WHERE id = ?').run(u.id); // cascades DMs, saved, members, reactions, stories...
  files.forEach(releaseFile);
  rt.disconnectUser(u.id);
  rt.emitAll('user:delete', { id: u.id });
  res.json({ ok: true });
});

router.get('/users', (req, res) => {
  const owner = req.user.role === 'owner';
  const rows = q('SELECT * FROM users ORDER BY display_name COLLATE NOCASE').all().filter((u) => owner || !u.banned || u.id === req.user.id);
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
