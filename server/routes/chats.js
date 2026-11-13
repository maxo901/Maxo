const router = require('express').Router();
const crypto = require('crypto');
const { db, q } = require('../db');
const rt = require('../realtime');
const { mediaUpload, avatarUpload, kindOf, baseMime, removeFile } = require('../upload');
const {
  pub, toId, isGroupish, releaseFile, MSG_SELECT, NOT_HIDDEN, hydrate, getMessage, getChatFor, otherOf,
  audience, broadcast, canPost, ensureSaved, groupMeta, chatView,
} = require('../util');

const EMOJI_RE = /^\p{Extended_Pictographic}\uFE0F?$/u;
const KIND = { group: 'g', channel: 'c' };
const newCode = () => crypto.randomBytes(9).toString('base64url');
const err = (res, code, error) => res.status(code).json({ error });
const clearedOf = (chatId, me) => (q('SELECT cleared_id FROM reads WHERE chat_id = ? AND user_id = ?').get(chatId, me) || { cleared_id: 0 }).cleared_id;

// chat the caller created (group/channel) — needed for any management action
function managed(req, res) {
  const c = getChatFor(req.user.id, toId(req.params.id));
  if (!c || !isGroupish(c)) { err(res, 404, 'گفتگو پیدا نشد'); return null; }
  if (c.created_by !== req.user.id) { err(res, 403, 'فقط سازنده می‌تواند این کار را انجام دهد'); return null; }
  return c;
}

/* ---------- chats ---------- */

router.get('/chats', (req, res) => {
  const me = req.user.id;
  ensureSaved(me);
  const rows = q(`SELECT c.* FROM chats c WHERE
      (c.type IN ('group','channel') AND EXISTS (SELECT 1 FROM members m WHERE m.chat_id = c.id AND m.user_id = ?))
      OR (c.type = 'dm' AND (c.user_a = ? OR c.user_b = ?)) OR (c.type = 'saved' AND c.user_a = ?)`).all(me, me, me, me);
  res.json({ chats: rows.map((c) => chatView(c, me)) });
});

// any user can create a group or a channel; the owner's chats automatically include everybody
router.post('/chats', (req, res) => {
  const type = req.body?.type === 'channel' ? 'channel' : 'group';
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  if (!title || title.length > 60) return err(res, 400, 'نام باید بین ۱ تا ۶۰ کاراکتر باشد');
  if (description.length > 200) return err(res, 400, 'توضیحات حداکثر ۲۰۰ کاراکتر است');
  const forced = req.user.role === 'owner' ? 1 : 0;

  const id = db.transaction(() => {
    const info = q('INSERT INTO chats (type, title, description, created_by, created_at, invite_code, forced) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(type, title, description, req.user.id, Date.now(), newCode(), forced);
    const cid = info.lastInsertRowid;
    if (forced) q("INSERT INTO members (chat_id, user_id, role, joined_at) SELECT ?, id, CASE WHEN id = ? THEN 'owner' ELSE 'member' END, ? FROM users").run(cid, req.user.id, Date.now());
    else q("INSERT INTO members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").run(cid, req.user.id, Date.now());
    return cid;
  })();

  const chat = q('SELECT * FROM chats WHERE id = ?').get(id);
  rt.emitToUsers(audience(chat).filter((u) => u !== req.user.id), 'chat:new', { chat: { ...groupMeta(chat), unread: 0, my_read: 0, last: null } });
  res.status(201).json({ chat: chatView(chat, req.user.id) });
});

router.post('/chats/dm', (req, res) => {
  const other = toId(req.body?.user_id);
  if (!other || other === req.user.id) return err(res, 400, 'کاربر نامعتبر است');
  const target = q('SELECT * FROM users WHERE id = ?').get(other);
  if (!target || target.banned) return err(res, 404, 'کاربر پیدا نشد');
  const [a, b] = [req.user.id, other].sort((x, y) => x - y);
  let chat = q("SELECT * FROM chats WHERE type = 'dm' AND user_a = ? AND user_b = ?").get(a, b);
  if (!chat) {
    const info = q("INSERT INTO chats (type, user_a, user_b, created_by, created_at) VALUES ('dm', ?, ?, ?, ?)").run(a, b, req.user.id, Date.now());
    chat = q('SELECT * FROM chats WHERE id = ?').get(info.lastInsertRowid);
  }
  res.json({ chat: chatView(chat, req.user.id) });
});

router.patch('/chats/:id', (req, res) => {
  const c = managed(req, res);
  if (!c) return;
  const b = req.body || {};
  const title = b.title !== undefined ? String(b.title).trim() : c.title;
  const description = b.description !== undefined ? String(b.description).trim() : c.description;
  const closed = b.closed !== undefined && c.type === 'group' ? (b.closed ? 1 : 0) : c.closed;
  if (!title || title.length > 60) return err(res, 400, 'نام باید بین ۱ تا ۶۰ کاراکتر باشد');
  if (description.length > 200) return err(res, 400, 'توضیحات حداکثر ۲۰۰ کاراکتر است');
  q('UPDATE chats SET title = ?, description = ?, closed = ? WHERE id = ?').run(title, description, closed, c.id);
  const n = q('SELECT * FROM chats WHERE id = ?').get(c.id);
  broadcast(n, 'chat:update', { chat: groupMeta(n) });
  res.json({ chat: chatView(n, req.user.id) });
});

router.post('/chats/:id/avatar', avatarUpload.single('file'), (req, res) => {
  const c = managed(req, res);
  if (!c) { if (req.file) removeFile('/uploads/' + req.file.filename); return; }
  if (!req.file) return err(res, 400, 'تصویری انتخاب نشده است');
  q('UPDATE chats SET avatar = ? WHERE id = ?').run('/uploads/' + req.file.filename, c.id);
  releaseFile(c.avatar);
  const n = q('SELECT * FROM chats WHERE id = ?').get(c.id);
  broadcast(n, 'chat:update', { chat: groupMeta(n) });
  res.json({ chat: chatView(n, req.user.id) });
});

router.delete('/chats/:id/avatar', (req, res) => {
  const c = managed(req, res);
  if (!c) return;
  q('UPDATE chats SET avatar = NULL WHERE id = ?').run(c.id);
  releaseFile(c.avatar);
  const n = q('SELECT * FROM chats WHERE id = ?').get(c.id);
  broadcast(n, 'chat:update', { chat: groupMeta(n) });
  res.json({ chat: chatView(n, req.user.id) });
});

router.post('/chats/:id/invite/reset', (req, res) => {
  const c = managed(req, res);
  if (!c) return;
  q('UPDATE chats SET invite_code = ? WHERE id = ?').run(newCode(), c.id);
  res.json({ chat: chatView(q('SELECT * FROM chats WHERE id = ?').get(c.id), req.user.id) });
});

router.delete('/chats/:id', (req, res) => {
  const c = managed(req, res);
  if (!c) return;
  const users = audience(c);
  const files = q('SELECT file_url FROM messages WHERE chat_id = ? AND file_url IS NOT NULL').all(c.id).map((r) => r.file_url);
  files.push(c.avatar);
  q('DELETE FROM chats WHERE id = ?').run(c.id);
  files.forEach(releaseFile);
  rt.emitToUsers(users, 'chat:delete', { id: c.id });
  res.json({ ok: true });
});

router.post('/chats/:id/leave', (req, res) => {
  const c = getChatFor(req.user.id, toId(req.params.id));
  if (!c || !isGroupish(c)) return err(res, 404, 'گفتگو پیدا نشد');
  if (c.forced) return err(res, 400, 'ترک این گروه امکان‌پذیر نیست');
  if (c.created_by === req.user.id) return err(res, 400, 'سازنده نمی‌تواند ترک کند؛ آن را حذف کنید');
  q('DELETE FROM members WHERE chat_id = ? AND user_id = ?').run(c.id, req.user.id);
  rt.emitToUsers([req.user.id], 'chat:delete', { id: c.id });
  broadcast(c, 'chat:update', { chat: groupMeta(c) });
  res.json({ ok: true });
});

router.get('/chats/:id/members', (req, res) => {
  const c = getChatFor(req.user.id, toId(req.params.id));
  if (!c || !isGroupish(c)) return err(res, 404, 'گفتگو پیدا نشد');
  const rows = q(`SELECT u.*, m.role AS m_role FROM members m JOIN users u ON u.id = m.user_id
                  WHERE m.chat_id = ? AND u.banned = 0 ORDER BY (m.role = 'owner') DESC, u.display_name COLLATE NOCASE LIMIT 500`).all(c.id);
  res.json({ members: rows.map((r) => ({ ...pub(r), member_role: r.m_role })) });
});

/* ---------- invite links: /g/<code> for groups, /c/<code> for channels ---------- */

const byInvite = (kind, code) => {
  const c = q("SELECT * FROM chats WHERE invite_code = ? AND type IN ('group','channel')").get(String(code));
  return c && KIND[c.type] === kind ? c : null;
};

router.get('/invite/:kind/:code', (req, res) => {
  const c = byInvite(req.params.kind, req.params.code);
  if (!c) return err(res, 404, 'لینک دعوت معتبر نیست');
  const joined = !!q('SELECT 1 FROM members WHERE chat_id = ? AND user_id = ?').get(c.id, req.user.id);
  res.json({ chat: { ...groupMeta(c), id: joined ? c.id : undefined }, joined });
});

router.post('/invite/:kind/:code/join', (req, res) => {
  const c = byInvite(req.params.kind, req.params.code);
  if (!c) return err(res, 404, 'لینک دعوت معتبر نیست');
  q("INSERT OR IGNORE INTO members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(c.id, req.user.id, Date.now());
  broadcast(c, 'chat:update', { chat: groupMeta(c) });
  res.json({ chat: chatView(c, req.user.id) });
});

/* ---------- messages ---------- */

router.get('/chats/:id/messages', (req, res) => {
  const me = req.user.id;
  const chat = getChatFor(me, toId(req.params.id));
  if (!chat) return err(res, 404, 'گفتگو پیدا نشد');
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const before = parseInt(req.query.before, 10) || 0;
  const floor = clearedOf(chat.id, me);

  const rows = before
    ? q(MSG_SELECT + ' WHERE m.chat_id = ? AND m.id > ? AND m.id < ?' + NOT_HIDDEN + ' ORDER BY m.id DESC LIMIT ?').all(chat.id, floor, before, me, limit)
    : q(MSG_SELECT + ' WHERE m.chat_id = ? AND m.id > ?' + NOT_HIDDEN + ' ORDER BY m.id DESC LIMIT ?').all(chat.id, floor, me, limit);
  rows.reverse();

  let peer_read = null;
  if (chat.type === 'dm') {
    const r = q('SELECT last_id FROM reads WHERE chat_id = ? AND user_id = ?').get(chat.id, otherOf(chat, me));
    peer_read = r ? r.last_id : 0;
  }
  res.json({ messages: hydrate(rows), has_more: rows.length === limit, peer_read });
});

// shared media / files / voice of a chat
router.get('/chats/:id/media', (req, res) => {
  const me = req.user.id;
  const chat = getChatFor(me, toId(req.params.id));
  if (!chat) return err(res, 404, 'گفتگو پیدا نشد');
  const kind = req.query.type;
  const types = kind === 'files' ? ['file'] : kind === 'voice' ? ['voice'] : ['image', 'video'];
  const rows = q(`${MSG_SELECT} WHERE m.chat_id = ? AND m.id > ? AND m.type IN (${types.map(() => '?').join(',')})${NOT_HIDDEN} ORDER BY m.id DESC LIMIT 60`)
    .all(chat.id, clearedOf(chat.id, me), ...types, me);
  res.json({ messages: hydrate(rows) });
});

router.post('/chats/:id/messages', mediaUpload.single('file'), (req, res) => {
  const f = req.file;
  const fail = (code, msg) => { if (f) removeFile('/uploads/' + f.filename); return err(res, code, msg); };

  const chat = getChatFor(req.user.id, toId(req.params.id));
  if (!chat) return fail(404, 'گفتگو پیدا نشد');
  if (!canPost(chat, req.user))
    return fail(403, chat.type === 'channel' ? 'فقط سازنده کانال می‌تواند پست بگذارد' : 'این گروه بسته است و فقط سازنده می‌تواند پیام بدهد');
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
  const fileName = f ? String(req.body?.file_name || f.originalname || 'file').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 120) : null;
  const duration = Math.min(Math.max(parseInt(req.body?.duration, 10) || 0, 0), 7200) || null;

  const info = q(`INSERT INTO messages (chat_id, sender_id, type, text, file_url, file_name, file_size, file_mime, duration, reply_to, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(chat.id, req.user.id, type, text, f ? '/uploads/' + f.filename : null, fileName, f ? f.size : null, f ? baseMime(f.mimetype) : null, duration, replyTo, Date.now());
  const message = getMessage(info.lastInsertRowid);
  broadcast(chat, 'message:new', { message });
  res.status(201).json({ message });
});

router.patch('/messages/:id', (req, res) => {
  const m = q('SELECT * FROM messages WHERE id = ?').get(toId(req.params.id));
  if (!m) return err(res, 404, 'پیام پیدا نشد');
  const chat = getChatFor(req.user.id, m.chat_id);
  if (!chat || m.sender_id !== req.user.id) return err(res, 403, 'اجازه ویرایش این پیام را ندارید');
  if (!canPost(chat, req.user)) return err(res, 403, 'این گروه بسته است');
  const text = String(req.body?.text || '').trim();
  if (!text && !m.file_url) return err(res, 400, 'متن پیام نمی‌تواند خالی باشد');
  if (text.length > 4000) return err(res, 400, 'متن پیام بیش از حد طولانی است');
  if (text !== m.text) q('UPDATE messages SET text = ?, edited_at = ? WHERE id = ?').run(text, Date.now(), m.id);
  const message = getMessage(m.id);
  broadcast(chat, 'message:edit', { message });
  res.json({ message });
});

// ?scope=me  → hide just for me;  ?scope=all → delete for everybody
router.delete('/messages/:id', (req, res) => {
  const me = req.user.id;
  const m = q('SELECT * FROM messages WHERE id = ?').get(toId(req.params.id));
  const chat = m && getChatFor(me, m.chat_id);
  if (!chat) return err(res, 404, 'پیام پیدا نشد');

  if (req.query.scope === 'me') {
    q('INSERT OR IGNORE INTO hidden (message_id, user_id) VALUES (?, ?)').run(m.id, me);
    rt.emitToUsers([me], 'message:delete', { chat_id: chat.id, id: m.id });
    return res.json({ ok: true });
  }
  const allowed = m.sender_id === me || chat.type === 'dm' || (isGroupish(chat) && chat.created_by === me);
  if (!allowed) return err(res, 403, 'اجازه حذف این پیام را ندارید');
  q('DELETE FROM messages WHERE id = ?').run(m.id);
  releaseFile(m.file_url);
  broadcast(chat, 'message:delete', { chat_id: chat.id, id: m.id });
  res.json({ ok: true });
});

// copy a message into my Saved Messages
router.post('/messages/:id/save', (req, res) => {
  const me = req.user.id;
  const m = q('SELECT * FROM messages WHERE id = ?').get(toId(req.params.id));
  if (!m || !getChatFor(me, m.chat_id)) return err(res, 404, 'پیام پیدا نشد');
  const saved = ensureSaved(me);
  const from = m.sender_id ? (q('SELECT display_name FROM users WHERE id = ?').get(m.sender_id) || {}).display_name : null;
  const info = q(`INSERT INTO messages (chat_id, sender_id, type, text, file_url, file_name, file_size, file_mime, duration, fwd_name, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(saved.id, me, m.type, m.text, m.file_url, m.file_name, m.file_size, m.file_mime, m.duration, from || null, Date.now());
  const message = getMessage(info.lastInsertRowid);
  broadcast(saved, 'message:new', { message });
  res.status(201).json({ message });
});

router.put('/messages/:id/reaction', (req, res) => {
  const m = q('SELECT * FROM messages WHERE id = ?').get(toId(req.params.id));
  const chat = m && getChatFor(req.user.id, m.chat_id);
  if (!chat) return err(res, 404, 'پیام پیدا نشد');
  const emoji = req.body?.emoji;
  const cur = q('SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?').get(m.id, req.user.id);
  if (!emoji || (cur && cur.emoji === emoji)) {
    q('DELETE FROM reactions WHERE message_id = ? AND user_id = ?').run(m.id, req.user.id);
  } else {
    if (typeof emoji !== 'string' || !EMOJI_RE.test(emoji)) return err(res, 400, 'ری‌اکشن نامعتبر است');
    q(`INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)
       ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji`).run(m.id, req.user.id, emoji);
  }
  const reactions = getMessage(m.id).reactions;
  broadcast(chat, 'message:reaction', { chat_id: chat.id, message_id: m.id, reactions });
  res.json({ reactions });
});

router.post('/chats/:id/read', (req, res) => {
  const chat = getChatFor(req.user.id, toId(req.params.id));
  if (!chat) return err(res, 404, 'گفتگو پیدا نشد');
  const max = q('SELECT COALESCE(MAX(id), 0) AS m FROM messages WHERE chat_id = ?').get(chat.id).m;
  const last = Math.min(toId(req.body?.last_id), max);
  q(`INSERT INTO reads (chat_id, user_id, last_id) VALUES (?, ?, ?)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)`).run(chat.id, req.user.id, last);
  if (chat.type === 'dm') rt.emitToUsers([otherOf(chat, req.user.id)], 'chat:read', { chat_id: chat.id, user_id: req.user.id, last_id: last });
  res.json({ ok: true });
});

// clear history: for me only, or (DM / my own group) for everybody
router.post('/chats/:id/clear', (req, res) => {
  const me = req.user.id;
  const chat = getChatFor(me, toId(req.params.id));
  if (!chat) return err(res, 404, 'گفتگو پیدا نشد');
  if (req.body?.both) {
    if (isGroupish(chat) && chat.created_by !== me) return err(res, 403, 'فقط سازنده می‌تواند تاریخچه را برای همه پاک کند');
    const files = q('SELECT file_url FROM messages WHERE chat_id = ? AND file_url IS NOT NULL').all(chat.id).map((r) => r.file_url);
    q('DELETE FROM messages WHERE chat_id = ?').run(chat.id);
    files.forEach(releaseFile);
    broadcast(chat, 'chat:cleared', { chat_id: chat.id });
  } else {
    const max = q('SELECT COALESCE(MAX(id), 0) AS m FROM messages WHERE chat_id = ?').get(chat.id).m;
    q(`INSERT INTO reads (chat_id, user_id, last_id, cleared_id) VALUES (?, ?, ?, ?)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET cleared_id = excluded.cleared_id, last_id = MAX(last_id, excluded.last_id)`).run(chat.id, me, max, max);
    rt.emitToUsers([me], 'chat:cleared', { chat_id: chat.id });
  }
  res.json({ ok: true });
});

module.exports = router;
