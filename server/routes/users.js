const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db, q } = require('../db');
const rt = require('../realtime');
const { ownerOnly, signToken } = require('../auth');
const { avatarUpload, wallpaperUpload } = require('../upload');
const { pub, toId, purgeFiles, memberIds } = require('../util');

const byId = (id) => q('SELECT * FROM users WHERE id = ?').get(id);
const parseSettings = (s) => { try { return JSON.parse(s) || {}; } catch { return {}; } };
const meView = (u) => ({
  ...pub(u, u.id),
  email: u.email.endsWith('@users.local') ? '' : u.email,
  show_online: u.show_online !== 0,
  wallpaper: u.wallpaper || null,
  settings: parseSettings(u.settings),
});
const broadcastUser = (u) => rt.emitAll('user:update', { user: pub(u) });

router.get('/me', (req, res) => res.json(meView(req.user)));

router.patch('/me', (req, res) => {
  const name = String(req.body?.display_name ?? req.user.display_name).trim();
  const bio = String(req.body?.bio ?? req.user.bio).trim();
  if (!name || name.length > 40) return res.status(400).json({ error: 'e.bad_name' });
  if (bio.length > 160) return res.status(400).json({ error: 'e.bad_bio' });
  q('UPDATE users SET display_name = ?, bio = ? WHERE id = ?').run(name, bio, req.user.id);
  const u = byId(req.user.id);
  broadcastUser(u);
  res.json(meView(u));
});

router.post('/me/avatar', avatarUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'e.no_image' });
  const old = req.user.avatar;
  q('UPDATE users SET avatar = ? WHERE id = ?').run('/uploads/' + req.file.filename, req.user.id);
  purgeFiles([old]);
  const u = byId(req.user.id);
  broadcastUser(u);
  res.json(meView(u));
});

router.delete('/me/avatar', (req, res) => {
  const old = req.user.avatar;
  q('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  purgeFiles([old]);
  const u = byId(req.user.id);
  broadcastUser(u);
  res.json(meView(u));
});

router.post('/me/wallpaper', wallpaperUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'e.no_image' });
  const old = req.user.wallpaper;
  q('UPDATE users SET wallpaper = ? WHERE id = ?').run('/uploads/' + req.file.filename, req.user.id);
  purgeFiles([old]);
  res.json(meView(byId(req.user.id)));
});

router.delete('/me/wallpaper', (req, res) => {
  const old = req.user.wallpaper;
  q('UPDATE users SET wallpaper = NULL WHERE id = ?').run(req.user.id);
  purgeFiles([old]);
  res.json(meView(byId(req.user.id)));
});

// UI preferences (theme, text size, wallpaper, language…) follow the account.
const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const str = (v, d, n = 24) => (typeof v === 'string' && /^[\w-]{1,24}$/.test(v) ? v.slice(0, n) : d);
router.put('/me/settings', (req, res) => {
  const b = req.body || {};
  if (b.settings && typeof b.settings === 'object') {
    const s = b.settings;
    const clean = {
      theme: str(s.theme, 'auto'), wp: str(s.wp, 'theme'), lang: str(s.lang, 'fa', 8),
      textSize: num(s.textSize, 12, 24, 15), radius: num(s.radius, 0, 24, 14),
      anim: s.anim !== false, pattern: s.pattern !== false,
    };
    q('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(clean), req.user.id);
  }
  if (b.show_online !== undefined) {
    q('UPDATE users SET show_online = ? WHERE id = ?').run(b.show_online ? 1 : 0, req.user.id);
    const u = byId(req.user.id);
    broadcastUser(u);
    rt.refreshPresence(u.id);
  }
  res.json(meView(byId(req.user.id)));
});

router.patch('/me/password', (req, res) => {
  const cur = String(req.body?.current || '');
  const next = String(req.body?.password || '');
  if (!bcrypt.compareSync(cur, req.user.password_hash)) return res.status(403).json({ error: 'e.wrong_password' });
  if (next.length < 8 || next.length > 72) return res.status(400).json({ error: 'e.bad_password' });
  q('UPDATE users SET password_hash = ?, pwd_at = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), (Math.floor(Date.now() / 1000) + 1) * 1000, req.user.id);
  rt.disconnectUser(req.user.id); // every other device has to sign in again
  res.json({ ok: true, token: signToken(byId(req.user.id)) });
});

router.delete('/me', (req, res) => {
  const u = req.user;
  if (u.role === 'owner') return res.status(400).json({ error: 'e.owner_no_delete' });
  if (!bcrypt.compareSync(String(req.body?.password || ''), u.password_hash))
    return res.status(403).json({ error: 'e.wrong_password' });

  const urls = [u.avatar, u.wallpaper];
  q('SELECT file_url AS f FROM stories WHERE user_id = ?').all(u.id).forEach((r) => urls.push(r.f));
  q(`SELECT m.file_url AS f FROM messages m JOIN chats c ON c.id = m.chat_id
     WHERE c.type = 'dm' AND (c.user_a = ? OR c.user_b = ?) AND m.file_url IS NOT NULL`)
    .all(u.id, u.id).forEach((r) => urls.push(r.f));

  // groups/channels this user created disappear with them (owner-made ones stay)
  const owned = q("SELECT * FROM chats WHERE type = 'group' AND created_by = ? AND official = 0").all(u.id);
  const gone = [];
  for (const c of owned) {
    urls.push(c.avatar);
    q('SELECT file_url AS f FROM messages WHERE chat_id = ? AND file_url IS NOT NULL').all(c.id).forEach((r) => urls.push(r.f));
    gone.push({ id: c.id, members: memberIds(c) });
  }

  db.transaction(() => {
    owned.forEach((c) => q('DELETE FROM chats WHERE id = ?').run(c.id));
    q('DELETE FROM users WHERE id = ?').run(u.id); // cascades DMs, memberships, reads, stories…
  })();
  purgeFiles(urls);

  gone.forEach((g) => rt.emitToUsers(g.members, 'chat:delete', { id: g.id }));
  rt.disconnectUser(u.id);
  rt.emitAll('user:delete', { id: u.id });
  res.json({ ok: true });
});

router.get('/users', (req, res) => {
  const owner = req.user.role === 'owner';
  const rows = q('SELECT * FROM users ORDER BY display_name COLLATE NOCASE')
    .all()
    .filter((u) => owner || !u.banned || u.id === req.user.id);
  res.json({ users: rows.map((u) => pub(u, req.user.id)) });
});

router.get('/users/:id', (req, res) => {
  const u = byId(toId(req.params.id));
  if (!u || (u.banned && req.user.role !== 'owner')) return res.status(404).json({ error: 'e.user_not_found' });
  const common = q(
    `SELECT c.id, c.title, c.kind, c.avatar FROM chats c
     JOIN chat_members a ON a.chat_id = c.id AND a.user_id = ?
     JOIN chat_members b ON b.chat_id = c.id AND b.user_id = ?
     WHERE c.type = 'group' ORDER BY c.title COLLATE NOCASE`
  ).all(req.user.id, u.id);
  const out = { user: pub(u, req.user.id), common_groups: common };
  if (req.user.role === 'owner') out.email = u.email.endsWith('@users.local') ? '' : u.email;
  res.json(out);
});

router.post('/users/:id/ban', ownerOnly, (req, res) => {
  const t = byId(toId(req.params.id));
  if (!t) return res.status(404).json({ error: 'e.user_not_found' });
  if (t.role === 'owner') return res.status(400).json({ error: 'e.cannot_ban_owner' });
  const banned = req.body?.banned ? 1 : 0;
  q('UPDATE users SET banned = ? WHERE id = ?').run(banned, t.id);
  if (banned) rt.disconnectUser(t.id);
  const u = byId(t.id);
  broadcastUser(u);
  res.json({ user: pub(u, req.user.id) });
});

module.exports = router;
