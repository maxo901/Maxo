const router = require('express').Router();
const { q } = require('../db');
const rt = require('../realtime');
const { ownerOnly } = require('../auth');
const { mediaUpload, kindOf, baseMime, removeFile } = require('../upload');
const { toId, MSG_SELECT, hydrate, getMessage, getChatFor, otherOf, broadcast, groupMeta, chatView } = require('../util');

const EMOJI_RE = /^\p{Extended_Pictographic}\uFE0F?$/u;

/* ---------- chats ---------- */

router.get('/chats', (req, res) => {
  const me = req.user.id;
  const rows = q("SELECT * FROM chats WHERE type = 'group' OR user_a = ? OR user_b = ?").all(me, me);
  res.json({ chats: rows.map((c) => chatView(c, me)) });
});

router.post('/chats/group', ownerOnly, (req, res) => {
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  if (!title || title.length > 60) return res.status(400).json({ error: 'نام گروه باید بین ۱ تا ۶۰ کاراکتر باشد' });
  if (description.length > 200) return res.status(400).json({ error: 'توضیحات حداکثر ۲۰۰ کاراکتر است' });
  const info = q("INSERT INTO chats (type, title, description, created_by, created_at) VALUES ('group', ?, ?, ?, ?)")
    .run(title, description, req.user.id, Date.now());
  const chat = q('SELECT * FROM chats WHERE id = ?').get(info.lastInsertRowid);
  rt.emitAll('chat:new', { chat: { ...groupMeta(chat), unread: 0, my_read: 0, last: null } });
  res.status(201).json({ chat: chatView(chat, req.user.id) });
});

router.post('/chats/dm', (req, res) => {
  const other = toId(req.body?.user_id);
  if (!other || other === req.user.id) return res.status(400).json({ error: 'کاربر نامعتبر است' });
  const target = q('SELECT * FROM users WHERE id = ?').get(other);
  if (!target || target.banned) return res.status(404).json({ error: 'کاربر پیدا نشد' });

  const [a, b] = [req.user.id, other].sort((x, y) => x - y);
  let chat = q("SELECT * FROM chats WHERE type = 'dm' AND user_a = ? AND user_b = ?").get(a, b);
  if (!chat) {
    const info = q("INSERT INTO chats (type, user_a, user_b, created_by, created_at) VALUES ('dm', ?, ?, ?, ?)")
      .run(a, b, req.user.id, Date.now());
    chat = q('SELECT * FROM chats WHERE id = ?').get(info.lastInsertRowid);
  }
  res.json({ chat: chatView(chat, req.user.id) });
});

router.patch('/chats/:id', ownerOnly, (req, res) => {
  const c = q("SELECT * FROM chats WHERE id = ? AND type = 'group'").get(toId(req.params.id));
  if (!c) return res.status(404).json({ error: 'گروه پیدا نشد' });
  const b = req.body || {};
  const title = b.title !== undefined ? String(b.title).trim() : c.title;
  const description = b.description !== undefined ? String(b.description).trim() : c.description;
  const closed = b.closed !== undefined ? (b.closed ? 1 : 0) : c.closed;
  if (!title || title.length > 60) return res.status(400).json({ error: 'نام گروه باید بین ۱ تا ۶۰ کاراکتر باشد' });
  if (description.length > 200) return res.status(400).json({ error: 'توضیحات حداکثر ۲۰۰ کاراکتر است' });
  q('UPDATE chats SET title = ?, description = ?, closed = ? WHERE id = ?').run(title, description, closed, c.id);
  const n = q('SELECT * FROM chats WHERE id = ?').get(c.id);
  rt.emitAll('chat:update', { chat: groupMeta(n) });
  res.json({ chat: chatView(n, req.user.id) });
});

router.delete('/chats/:id', ownerOnly, (req, res) => {
  const c = q("SELECT * FROM chats WHERE id = ? AND type = 'group'").get(toId(req.params.id));
  if (!c) return res.status(404).json({ error: 'گروه پیدا نشد' });
  q('SELECT file_url FROM messages WHERE chat_id = ? AND file_url IS NOT NULL').all(c.id).forEach((r) => removeFile(r.file_url));
  q('DELETE FROM chats WHERE id = ?').run(c.id);
  rt.emitAll('chat:delete', { id: c.id });
  res.json({ ok: true });
});

/* ---------- messages ---------- */

router.get('/chats/:id/messages', (req, res) => {
  const chat = getChatFor(req.user.id, toId(req.params.id));
  if (!chat) return res.status(404).json({ error: 'گفتگو پیدا نشد' });

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const before = parseInt(req.query.before, 10) || 0;
  const rows = before
    ? q(MSG_SELECT + ' WHERE m.chat_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?').all(chat.id, before, limit)
    : q(MSG_SELECT + ' WHERE m.chat_id = ? ORDER BY m.id DESC LIMIT ?').all(chat.id, limit);
  rows.reverse();

  let peer_read = null;
  if (chat.type === 'dm') {
    const r = q('SELECT last_id FROM reads WHERE chat_id = ? AND user_id = ?').get(chat.id, otherOf(chat, req.user.id));
    peer_read = r ? r.last_id : 0;
  }
  res.json({ messages: hydrate(rows), has_more: rows.length === limit, peer_read });
});

router.post('/chats/:id/messages', mediaUpload.single('file'), (req, res) => {
  const f = req.file;
  const fail = (code, error) => {
    if (f) removeFile('/uploads/' + f.filename);
    return res.status(code).json({ error });
  };

  const chat = getChatFor(req.user.id, toId(req.params.id));
  if (!chat) return fail(404, 'گفتگو پیدا نشد');
  if (chat.closed && req.user.role !== 'owner') return fail(403, 'این گروه بسته است و فقط مالک می‌تواند پیام بدهد');
  if (chat.type === 'dm') {
    const other = q('SELECT banned FROM users WHERE id = ?').get(otherOf(chat, req.user.id));
    if (!other || other.banned) return fail(403, 'ارسال پیام به این کاربر ممکن نیست');
  }

  const text = String(req.body?.text || '').trim();
  if (text.length > 4000) return fail(400, 'متن پیام بیش از حد طولانی است');
  if (!text && !f) return fail(400, 'پیام خالی است');

  let replyTo = null;
  if (req.body?.reply_to) {
    const r = q('SELECT id FROM messages WHERE id = ? AND chat_id = ?').get(toId(req.body.reply_to), chat.id);
    if (r) replyTo = r.id;
  }

  const type = f ? kindOf(f.mimetype) : 'text';
  const fileName = f
    ? String(req.body?.file_name || f.originalname || 'file').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 120)
    : null;
  const duration = Math.min(Math.max(parseInt(req.body?.duration, 10) || 0, 0), 7200) || null;

  const info = q(
    `INSERT INTO messages (chat_id, sender_id, type, text, file_url, file_name, file_size, file_mime, duration, reply_to, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    chat.id, req.user.id, type, text,
    f ? '/uploads/' + f.filename : null, fileName, f ? f.size : null, f ? baseMime(f.mimetype) : null,
    duration, replyTo, Date.now()
  );

  const message = getMessage(info.lastInsertRowid);
  broadcast(chat, 'message:new', { message });
  res.status(201).json({ message });
});

router.patch('/messages/:id', (req, res) => {
  const m = q('SELECT * FROM messages WHERE id = ?').get(toId(req.params.id));
  if (!m) return res.status(404).json({ error: 'پیام پیدا نشد' });
  const chat = getChatFor(req.user.id, m.chat_id);
  if (!chat || m.sender_id !== req.user.id) return res.status(403).json({ error: 'اجازه ویرایش این پیام را ندارید' });
  if (chat.closed && req.user.role !== 'owner') return res.status(403).json({ error: 'این گروه بسته است' });

  const text = String(req.body?.text || '').trim();
  if (!text && !m.file_url) return res.status(400).json({ error: 'متن پیام نمی‌تواند خالی باشد' });
  if (text.length > 4000) return res.status(400).json({ error: 'متن پیام بیش از حد طولانی است' });

  if (text !== m.text) q('UPDATE messages SET text = ?, edited_at = ? WHERE id = ?').run(text, Date.now(), m.id);
  const message = getMessage(m.id);
  broadcast(chat, 'message:edit', { message });
  res.json({ message });
});

router.delete('/messages/:id', (req, res) => {
  const m = q('SELECT * FROM messages WHERE id = ?').get(toId(req.params.id));
  if (!m) return res.status(404).json({ error: 'پیام پیدا نشد' });
  const chat = getChatFor(req.user.id, m.chat_id);
  const allowed = chat && (m.sender_id === req.user.id || (req.user.role === 'owner' && chat.type === 'group'));
  if (!allowed) return res.status(403).json({ error: 'اجازه حذف این پیام را ندارید' });

  removeFile(m.file_url);
  q('DELETE FROM messages WHERE id = ?').run(m.id);
  broadcast(chat, 'message:delete', { chat_id: chat.id, id: m.id });
  res.json({ ok: true });
});

router.put('/messages/:id/reaction', (req, res) => {
  const m = q('SELECT * FROM messages WHERE id = ?').get(toId(req.params.id));
  const chat = m && getChatFor(req.user.id, m.chat_id);
  if (!chat) return res.status(404).json({ error: 'پیام پیدا نشد' });

  const emoji = req.body?.emoji;
  const cur = q('SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?').get(m.id, req.user.id);
  if (!emoji || (cur && cur.emoji === emoji)) {
    q('DELETE FROM reactions WHERE message_id = ? AND user_id = ?').run(m.id, req.user.id);
  } else {
    if (typeof emoji !== 'string' || !EMOJI_RE.test(emoji)) return res.status(400).json({ error: 'ری‌اکشن نامعتبر است' });
    q(`INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)
       ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji`).run(m.id, req.user.id, emoji);
  }
  const reactions = getMessage(m.id).reactions;
  broadcast(chat, 'message:reaction', { chat_id: chat.id, message_id: m.id, reactions });
  res.json({ reactions });
});

router.post('/chats/:id/read', (req, res) => {
  const chat = getChatFor(req.user.id, toId(req.params.id));
  if (!chat) return res.status(404).json({ error: 'گفتگو پیدا نشد' });
  const max = q('SELECT COALESCE(MAX(id), 0) AS m FROM messages WHERE chat_id = ?').get(chat.id).m;
  const last = Math.min(toId(req.body?.last_id), max);
  q(`INSERT INTO reads (chat_id, user_id, last_id) VALUES (?, ?, ?)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)`).run(chat.id, req.user.id, last);
  if (chat.type === 'dm')
    rt.emitToUsers([otherOf(chat, req.user.id)], 'chat:read', { chat_id: chat.id, user_id: req.user.id, last_id: last });
  res.json({ ok: true });
});

module.exports = router;
