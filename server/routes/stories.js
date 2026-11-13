const router = require('express').Router();
const { q } = require('../db');
const cfg = require('../config');
const rt = require('../realtime');
const { mediaUpload, kindOf, baseMime, removeFile } = require('../upload');
const { pub, toId, purgeFiles } = require('../util');

// Stories live 24 hours, are visible to every active user, and show who has seen them to their author.
router.get('/stories', (req, res) => {
  const me = req.user.id;
  const rows = q(
    `SELECT s.*, (SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.user_id = ?) AS seen,
            (SELECT COUNT(*) FROM story_views v WHERE v.story_id = s.id) AS views
     FROM stories s JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > ? AND u.banned = 0 ORDER BY s.created_at ASC`
  ).all(me, Date.now());

  const byUser = new Map();
  for (const s of rows) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id).push({
      id: s.id, type: s.type, url: s.file_url, mime: s.file_mime, caption: s.caption,
      created_at: s.created_at, expires_at: s.expires_at, seen: !!s.seen || s.user_id === me,
      views: s.user_id === me ? s.views : undefined,
    });
  }
  const groups = [...byUser].map(([uid, items]) => ({
    user: pub(q('SELECT * FROM users WHERE id = ?').get(uid), me),
    items,
    unseen: items.some((i) => !i.seen),
    latest: items[items.length - 1].created_at,
  }));
  groups.sort((a, b) => (a.user.id === me ? -1 : b.user.id === me ? 1 : 0) || b.unseen - a.unseen || b.latest - a.latest);
  res.json({ groups });
});

router.post('/stories', mediaUpload.single('file'), (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'e.bad_file' });
  const type = kindOf(f.mimetype);
  if (type !== 'image' && type !== 'video') {
    removeFile('/uploads/' + f.filename);
    return res.status(400).json({ error: 'e.bad_file' });
  }
  const caption = String(req.body?.caption || '').trim().slice(0, 200);
  const now = Date.now();
  q('INSERT INTO stories (user_id, type, file_url, file_mime, caption, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, type, '/uploads/' + f.filename, baseMime(f.mimetype), caption, now, now + cfg.STORY_TTL_MS);
  rt.emitAll('story:update', { user_id: req.user.id });
  res.status(201).json({ ok: true });
});

router.delete('/stories/:id', (req, res) => {
  const s = q('SELECT * FROM stories WHERE id = ?').get(toId(req.params.id));
  if (!s) return res.status(404).json({ error: 'e.story_not_found' });
  if (s.user_id !== req.user.id && req.user.role !== 'owner') return res.status(403).json({ error: 'e.no_permission' });
  q('DELETE FROM stories WHERE id = ?').run(s.id);
  purgeFiles([s.file_url]);
  rt.emitAll('story:update', { user_id: s.user_id });
  res.json({ ok: true });
});

router.post('/stories/:id/view', (req, res) => {
  const s = q('SELECT * FROM stories WHERE id = ? AND expires_at > ?').get(toId(req.params.id), Date.now());
  if (!s) return res.status(404).json({ error: 'e.story_not_found' });
  if (s.user_id !== req.user.id)
    q('INSERT OR IGNORE INTO story_views (story_id, user_id, seen_at) VALUES (?, ?, ?)').run(s.id, req.user.id, Date.now());
  res.json({ ok: true });
});

router.get('/stories/:id/views', (req, res) => {
  const s = q('SELECT * FROM stories WHERE id = ?').get(toId(req.params.id));
  if (!s || s.user_id !== req.user.id) return res.status(404).json({ error: 'e.story_not_found' });
  const rows = q(
    `SELECT u.*, v.seen_at FROM story_views v JOIN users u ON u.id = v.user_id WHERE v.story_id = ? ORDER BY v.seen_at DESC LIMIT 300`
  ).all(s.id);
  res.json({ views: rows.map((u) => ({ user: pub(u, req.user.id), seen_at: u.seen_at })) });
});

module.exports = router;
