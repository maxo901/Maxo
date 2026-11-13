const router = require('express').Router();
const { q } = require('../db');
const rt = require('../realtime');
const { mediaUpload, kindOf, removeFile } = require('../upload');
const { pub, toId, releaseFile } = require('../util');

const DAY = 24 * 3600 * 1000;

const view = (s, me) => ({
  id: s.id, user_id: s.user_id, type: s.type, url: s.file_url, caption: s.caption,
  created_at: s.created_at, expires_at: s.expires_at,
  seen: s.user_id === me || !!q('SELECT 1 FROM story_views WHERE story_id = ? AND user_id = ?').get(s.id, me),
  views: s.user_id === me ? q('SELECT COUNT(*) AS n FROM story_views WHERE story_id = ?').get(s.id).n : undefined,
});

router.get('/stories', (req, res) => {
  const rows = q(`SELECT s.* FROM stories s JOIN users u ON u.id = s.user_id
                  WHERE s.expires_at > ? AND u.banned = 0 ORDER BY s.created_at`).all(Date.now());
  res.json({ stories: rows.map((s) => view(s, req.user.id)) });
});

router.post('/stories', mediaUpload.single('file'), (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'فایلی انتخاب نشده است' });
  const kind = kindOf(f.mimetype);
  if (kind !== 'image' && kind !== 'video') { removeFile('/uploads/' + f.filename); return res.status(400).json({ error: 'فقط عکس یا ویدیو' }); }
  const caption = String(req.body?.caption || '').trim().slice(0, 200);
  const now = Date.now();
  const info = q('INSERT INTO stories (user_id, type, file_url, caption, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, kind, '/uploads/' + f.filename, caption, now, now + DAY);
  const s = q('SELECT * FROM stories WHERE id = ?').get(info.lastInsertRowid);
  rt.emitAll('story:new', { story: { ...view(s, -1), seen: false, views: undefined } });
  res.status(201).json({ story: view(s, req.user.id) });
});

router.post('/stories/:id/view', (req, res) => {
  const s = q('SELECT * FROM stories WHERE id = ?').get(toId(req.params.id));
  if (!s) return res.status(404).json({ error: 'پیدا نشد' });
  if (s.user_id !== req.user.id) q('INSERT OR IGNORE INTO story_views (story_id, user_id, viewed_at) VALUES (?, ?, ?)').run(s.id, req.user.id, Date.now());
  res.json({ ok: true });
});

router.get('/stories/:id/views', (req, res) => {
  const s = q('SELECT * FROM stories WHERE id = ?').get(toId(req.params.id));
  if (!s || s.user_id !== req.user.id) return res.status(404).json({ error: 'پیدا نشد' });
  const rows = q(`SELECT u.*, v.viewed_at FROM story_views v JOIN users u ON u.id = v.user_id WHERE v.story_id = ? ORDER BY v.viewed_at DESC LIMIT 200`).all(s.id);
  res.json({ views: rows.map((r) => ({ ...pub(r), viewed_at: r.viewed_at })) });
});

router.delete('/stories/:id', (req, res) => {
  const s = q('SELECT * FROM stories WHERE id = ?').get(toId(req.params.id));
  if (!s || (s.user_id !== req.user.id && req.user.role !== 'owner')) return res.status(404).json({ error: 'پیدا نشد' });
  q('DELETE FROM stories WHERE id = ?').run(s.id);
  releaseFile(s.file_url);
  rt.emitAll('story:delete', { id: s.id });
  res.json({ ok: true });
});

// hourly-ish cleanup of expired stories
function cleanup() {
  for (const s of q('SELECT * FROM stories WHERE expires_at <= ?').all(Date.now())) {
    q('DELETE FROM stories WHERE id = ?').run(s.id);
    releaseFile(s.file_url);
    rt.emitAll('story:delete', { id: s.id });
  }
}
setInterval(cleanup, 10 * 60 * 1000).unref();

module.exports = router;
