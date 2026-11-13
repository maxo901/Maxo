const router = require('express').Router();
const { db, q } = require('../db');
const rt = require('../realtime');
const limiter = require('../ratelimit');
const { mediaUpload, avatarUpload, kindOf, baseMime, removeFile } = require('../upload');
const {
  toId, randomCode, purgeFiles, NOT_HIDDEN, MSG_SELECT, hydrate, getMessage, getChatFor, otherOf, memberRow,
  memberIds, broadcast, canManage, canPost, clearFloor, ensureSaved, groupMeta, chatView, pub,
} = require('../util');

const EMOJI_RE = /^\p{Extended_Pictographic}\uFE0F?$/u;
const CODE_RE = /^[\w-]{8,40}$/;
const KIND_OF_PREFIX = { g: 'group', c: 'channel' };

const err = (res, code, key) => res.status(code).json({ error: key });
const chatFiles = (chatId) => q('SELECT file_url AS f FROM messages WHERE chat_id = ? AND file_url IS NOT NULL').all(chatId).map((r) => r.f);

/* ======================= chat list ======================= */

router.get('/chats', (req, res) => {
  const me = req.user;
  ensureSaved(me.id);
  const rows = q(
    `SELECT c.* FROM chats c WHERE (c.type = 'dm' AND (c.user_a = ? OR c.user_b = ?))
        OR (c.type = 'group' AND EXISTS (SELECT 1 FROM chat_members m WHERE m.chat_id = c.id AND m.user_id = ?))`
  ).all(me.id, me.id, me.id);
  res.json({ chats: rows.map((c) => chatView(c, me)) });
});

// Anyone can create a group or a channel. The owner's chats are "official": every user is in them.
router.post('/chats/group', limiter({ windowMs: 3600e3, max: 30 }), (req, res) => {
  const me = req.user;
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const kind = req.body?.kind === 'channel' ? 'channel' : 'group';
  const official = me.role === 'owner' && req.body?.official !== false;
  if (!title || title.length > 60) return err(res, 400, 'e.bad_title');
  if (description.length > 200) return err(res, 400, 'e.bad_desc');

  const id = db.transaction(() => {
    const info = q(
      `INSERT INTO chats (type, kind, title, description, official, invite_code, created_by, created_at)
       VALUES ('group', ?, ?, ?, ?, ?, ?, ?)`
    ).run(kind, title, description, official ? 1 : 0, official ? null : randomCode(), me.id, Date.now());
    const cid = info.lastInsertRowid;
    q("INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)").run(cid, me.id, Date.now());
    if (official)
      q(`INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at) SELECT ?, id, 'member', ? FROM users`).run(cid, Date.now());
    return cid;
  })();

  const chat = q('SELECT * FROM chats WHERE id = ?').get(id);
  if (official) rt.emitAll('chats:refresh', {});
  res.status(201).json({ chat: chatView(chat, me) });
});

router.post('/chats/dm', (req, res) => {
  const other = toId(req.body?.user_id);
  if (!other) return err(res, 400, 'e.invalid_user');
  if (other === req.user.id) return res.json({ chat: chatView(ensureSaved(req.user.id), req.user) });
  const target = q('SELECT * FROM users WHERE id = ?').get(other);
  if (!target || target.banned) return err(res, 404, 'e.user_not_found');

  const [a, b] = [req.user.id, other].sort((x, y) => x - y);
  let chat = q("SELECT * FROM chats WHERE type = 'dm' AND user_a = ? AND user_b = ?").get(a, b);
  if (!chat) {
    const info = q("INSERT INTO chats (type, user_a, user_b, created_by, created_at) VALUES ('dm', ?, ?, ?, ?)").run(a, b, req.user.id, Date.now());
    chat = q('SELECT * FROM chats WHERE id = ?').get(info.lastInsertRowid);
  }
  res.json({ chat: chatView(chat, req.user) });
});

/* ======================= group management ======================= */

function managed(req, res) {
  const c = getChatFor(req.user.id, toId(req.params.id));
  if (!c || c.type !== 'group') { err(res, 404, 'e.group_not_found'); return null; }
  if (!canManage(c, req.user)) { err(res, 403, 'e.no_permission'); return null; }
  return c;
}

router.patch('/chats/:id', (req, res) => {
  const c = managed(req, res);
  if (!c) return;
  const b = req.body || {};
  const title = b.title !== undefined ? String(b.title).trim() : c.title;
  const description = b.description !== undefined ? String(b.description).trim() : c.description;
  const closed = b.closed !== undefined ? (b.closed ? 1 : 0) : c.closed;
  if (!title || title.length > 60) return err(res, 400, 'e.bad_title');
  if (description.length > 200) return err(res, 400, 'e.bad_desc');
  q('UPDATE chats SET title = ?, description = ?, closed = ? WHERE id = ?').run(title, description, closed, c.id);
  const n = q('SELECT * FROM chats WHERE id = ?').get(c.id);
  broadcast(n, 'chat:update', { chat: groupMeta(n) });
  res.json({ chat: chatView(n, req.user) });
});

router.post('/chats/:id/avatar', avatarUpload.single('file'), (req, res) => {
  const c = managed(req, res);
  if (!c) { if (req.file) removeFile('/uploads/' + req.file.filename); return; }
  if (!req.file) return err(res, 400, 'e.no_image');
  q('UPDATE chats SET avatar = ? WHERE id = ?').run('/uploads/' + req.file.filename, c.id);
  purgeFiles([c.avatar]);
  const n = q('SELECT * FROM chats WHERE id = ?').get(c.id);
  broadcast(n, 'chat:update', { chat: groupMeta(n) });
  res.json({ chat: chatView(n, req.user) });
});

router.delete('/chats/:id/avatar', (req, res) => {
  const c = managed(req, res);
  if (!c) return;
  q('UPDATE chats SET avatar = NULL WHERE id = ?').run(c.id);
  purgeFiles([c.avatar]);
  const n = q('SELECT * FROM chats WHERE id = ?').get(c.id);
  broadcast(n, 'chat:update', { chat: groupMeta(n) });
  res.json({ chat: chatView(n, req.user) });
});

router.post('/chats/:id/invite/reset', (req, res) => {
  const c = managed(req, res);
  if (!c) return;
  if (c.official) return err(res, 400, 'e.no_permission');
  q('UPDATE chats SET invite_code = ? WHERE id = ?').run(randomCode(), c.id);
  res.json({ chat: chatView(q('SELECT * FROM chats WHERE id = ?').get(c.id), req.user) });
});

router.delete('/chats/:id', (req, res) => {
  const c = managed(req, res);
  if (!c) return;
  const members = memberIds(c);
  const urls = [...chatFiles(c.id), c.avatar];
  q('DELETE FROM chats WHERE id = ?').run(c.id);
  purgeFiles(urls);
  rt.emitToUsers(members, 'chat:delete', { id: c.id });
  res.json({ ok: true });
});

router.get('/chats/:id/members', (req, res) => {
  const c = getChatFor(req.user.id, toId(req.params.id));
  if (!c || c.type !== 'group') return err(res, 404, 'e.group_not_found');
  const rows = q(
    `SELECT u.*, m.role AS m_role FROM chat_members m JOIN users u ON u.id = m.user_id
     WHERE m.chat_id = ? AND u.banned = 0
     ORDER BY (m.role = 'admin') DESC, u.display_name COLLATE NOCASE LIMIT 1000`
  ).all(c.id);
  res.json({ members: rows.map((u) => ({ user: pub(u, req.user.id), role: u.m_role })) });
});

router.delete('/chats/:id/members/:uid', (req, res) => {
  const c = managed(req, res);
  if (!c) return;
  const uid = toId(req.params.uid);
  const m = memberRow(c.id, uid);
  if (!m || uid === req.user.id || m.role === 'admin' || c.official) return err(res, 400, 'e.cannot_kick');
  q('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(c.id, uid);
  rt.emitToUsers([uid], 'chat:removed', { id: c.id });
  broadcast(c, 'chat:update', { chat: groupMeta(c) });
  res.json({ ok: true });
});

router.post('/chats/:id/leave', (req, res) => {
  const c = getChatFor(req.user.id, toId(req.params.id));
  if (!c || c.type !== 'group') return err(res, 404, 'e.group_not_found');
  if (c.official) return err(res, 400, 'e.cannot_leave_official');
  if (memberRow(c.id, req.user.id).role === 'admin') return err(res, 400, 'e.admin_cannot_leave');
  q('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(c.id, req.user.id);
  broadcast(c, 'chat:update', { chat: groupMeta(c) });
  res.json({ ok: true });
});

/* ======================= invite links ======================= */
// Groups use /g/<code>, channels use /c/<code>: a group link never opens a channel and vice-versa.

function inviteChat(req) {
  const code = String(req.params.code || '');
  const kind = KIND_OF_PREFIX[req.query.k];
  if (!CODE_RE.test(code) || !kind) return null;
  return q("SELECT * FROM chats WHERE invite_code = ? AND type = 'group' AND official = 0 AND kind = ?").get(code, kind) || null;
}

router.get('/invite/:code', (req, res) => {
  const c = inviteChat(req);
  if (!c) return err(res, 404, 'e.invite_invalid');
  res.json({ chat: { ...groupMeta(c), is_member: !!memberRow(c.id, req.user.id) } });
});

router.post('/invite/:code/join', (req, res) => {
  const c = inviteChat(req);
  if (!c) return err(res, 404, 'e.invite_invalid');
  q("INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(c.id, req.user.id, Date.now());
  broadcast(c, 'chat:update', { chat: groupMeta(c) });
  res.json({ chat: chatView(c, req.user) });
});

/* ======================= messages ======================= */

router.get('/chats/:id/messages', (req, res) => {
  const chat = getChatFor(req.user.id, toId(req.params.id));
  if (!chat) return err(res, 404, 'e.chat_not_found');
  const me = req.user.id;

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const before = parseInt(req.query.before, 10) || 0;
  const floor = clearFloor(chat.id, me);
  const rows = before
    ? q(`${MSG_SELECT} WHERE m.chat_id = ? AND m.id > ? AND m.id < ? AND ${NOT_HIDDEN} ORDER BY m.id DESC LIMIT ?`).all(chat.id, floor, before, me, limit)
    : q(`${MSG_SELECT} WHERE m.chat_id = ? AND m.id > ? AND ${NOT_HIDDEN} ORDER BY m.id DESC LIMIT ?`).all(chat.id, floor, me, limit);
  rows.reverse();

  let peer_read = null;
  if (chat.type === 'dm') {
    const r = q('SELECT last_id FROM reads WHERE chat_id = ? AND user_id = ?').get(chat.id, otherOf(chat, me));
    peer_read = r ? r.last_id : 0;
  }
  res.json({ messages: hydrate(rows), has_more: rows.length === limit, peer_read });
});

router.get('/chats/:id/media', (req, res) => {
  const chat = getChatFor(req.user.id, toId(req.params.id));
  if (!chat) return err(res, 404, 'e.chat_not_found');
  const me = req.user.id;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const rows = q(
    `SELECT m.id, m.type, m.file_url AS url, m.created_at FROM messages m
     WHERE m.chat_id = ? AND m.id > ? AND m.type IN ('image','video') AND ${NOT_HIDDEN} ORDER BY m.id DESC LIMIT ?`
  ).all(chat.id, clearFloor(chat.id, me), me, limit);
  res.json({ media: rows });
});

router.post('/chats/:id/messages', mediaUpload.single('file'), (req, res) => {
  const f = req.file;
  const fail = (code, key) => {
    if (f) removeFile('/uploads/' + f.filename);
    return err(res, code, key);
  };

  const chat = getChatFor(req.user.id, toId(req.params.id));
  if (!chat) return fail(404, 'e.chat_not_found');
  if (!canPost(chat, req.user)) return fail(403, 'e.no_post');
  if (chat.type === 'dm' && chat.user_a !== chat.user_b) {
    const other = q('SELECT banned FROM users WHERE id = ?').get(otherOf(chat, req.user.id));
    if (!other || other.banned) return fail(403, 'e.cannot_message');
  }

  const text = String(req.body?.text || '').trim();
  if (text.length > 4000) return fail(400, 'e.msg_too_long');
  if (!text && !f) return fail(400, 'e.msg_empty');

  let replyTo = null;
  if (req.body?.reply_to) {
    const r = q('SELECT id FROM messages WHERE id = ? AND chat_id = ?').get(toId(req.body.reply_to), chat.id);
    if (r) replyTo = r.id;
  }

  const type = f ? kindOf(f.mimetype) : 'text';
  const fileName = f ? String(req.body?.file_name || f.originalname || 'file').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 120) : null;
  const duration = Math.min(Math.max(parseInt(req.body?.duration, 10) || 0, 0), 7200) || null;
  const dim = (v) => { v = parseInt(v, 10); return v > 0 && v < 20000 ? v : null; };
  const mw = f && (type === 'image' || type === 'video') ? dim(req.body?.w) : null;
  const mh = mw ? dim(req.body?.h) : null;

  const info = q(
    `INSERT INTO messages (chat_id, sender_id, type, text, file_url, file_name, file_size, file_mime, duration, media_w, media_h, reply_to, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    chat.id, req.user.id, type, text,
    f ? '/uploads/' + f.filename : null, fileName, f ? f.size : null, f ? baseMime(f.mimetype) : null,
    duration, mw, mh, replyTo, Date.now()
  );

  const message = getMessage(info.lastInsertRowid);
  broadcast(chat, 'message:new', { message });
  res.status(201).json({ message });
});

router.post('/messages/:id/forward', (req, res) => {
  const m = q('SELECT m.*, u.display_name AS s_name FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = ?').get(toId(req.params.id));
  const src = m && getChatFor(req.user.id, m.chat_id);
  if (!src) return err(res, 404, 'e.message_not_found');
  const targets = [...new Set((Array.isArray(req.body?.chat_ids) ? req.body.chat_ids : []).map(toId).filter(Boolean))].slice(0, 8);
  const sent = [];
  for (const cid of targets) {
    const chat = getChatFor(req.user.id, cid);
    if (!chat || !canPost(chat, req.user)) continue;
    if (chat.type === 'dm' && chat.user_a !== chat.user_b) {
      const other = q('SELECT banned FROM users WHERE id = ?').get(otherOf(chat, req.user.id));
      if (!other || other.banned) continue;
    }
    const info = q(
      `INSERT INTO messages (chat_id, sender_id, type, text, file_url, file_name, file_size, file_mime, duration, media_w, media_h, fwd_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(chat.id, req.user.id, m.type, m.text, m.file_url, m.file_name, m.file_size, m.file_mime, m.duration, m.media_w, m.media_h,
      m.fwd_name || m.s_name || '—', Date.now());
    const message = getMessage(info.lastInsertRowid);
    broadcast(chat, 'message:new', { message });
    sent.push(message.id);
  }
  res.json({ sent });
});

router.patch('/messages/:id', (req, res) => {
  const m = q('SELECT * FROM messages WHERE id = ?').get(toId(req.params.id));
  if (!m) return err(res, 404, 'e.message_not_found');
  const chat = getChatFor(req.user.id, m.chat_id);
  if (!chat || m.sender_id !== req.user.id) return err(res, 403, 'e.cannot_edit');
  if (!canPost(chat, req.user)) return err(res, 403, 'e.no_post');

  const text = String(req.body?.text || '').trim();
  if (!text && !m.file_url) return err(res, 400, 'e.msg_empty');
  if (text.length > 4000) return err(res, 400, 'e.msg_too_long');

  if (text !== m.text) q('UPDATE messages SET text = ?, edited_at = ? WHERE id = ?').run(text, Date.now(), m.id);
  const message = getMessage(m.id);
  broadcast(chat, 'message:edit', { message });
  res.json({ message });
});

// ?scope=me  -> hide only for me      ?scope=all (default) -> delete for both sides
router.delete('/messages/:id', (req, res) => {
  const m = q('SELECT * FROM messages WHERE id = ?').get(toId(req.params.id));
  if (!m) return err(res, 404, 'e.message_not_found');
  const chat = getChatFor(req.user.id, m.chat_id);
  if (!chat) return err(res, 403, 'e.cannot_delete');

  if (req.query.scope === 'me') {
    q('INSERT OR IGNORE INTO message_hides (message_id, user_id) VALUES (?, ?)').run(m.id, req.user.id);
    return res.json({ ok: true });
  }
  if (!(m.sender_id === req.user.id || canManage(chat, req.user))) return err(res, 403, 'e.cannot_delete');

  q('DELETE FROM messages WHERE id = ?').run(m.id);
  purgeFiles([m.file_url]);
  broadcast(chat, 'message:delete', { chat_id: chat.id, id: m.id });
  res.json({ ok: true });
});

router.post('/chats/:id/clear', (req, res) => {
  const chat = getChatFor(req.user.id, toId(req.params.id));
  if (!chat) return err(res, 404, 'e.chat_not_found');
  const max = q('SELECT COALESCE(MAX(id), 0) AS m FROM messages WHERE chat_id = ?').get(chat.id).m;

  if (req.body?.scope === 'all') {
    if (chat.type === 'group' && !canManage(chat, req.user)) return err(res, 403, 'e.no_permission');
    const urls = chatFiles(chat.id);
    q('DELETE FROM messages WHERE chat_id = ?').run(chat.id);
    purgeFiles(urls);
    broadcast(chat, 'chat:cleared', { chat_id: chat.id });
  } else {
    q(`INSERT INTO chat_clears (chat_id, user_id, last_id) VALUES (?, ?, ?)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)`).run(chat.id, req.user.id, max);
  }
  res.json({ ok: true });
});

router.put('/messages/:id/reaction', (req, res) => {
  const m = q('SELECT * FROM messages WHERE id = ?').get(toId(req.params.id));
  const chat = m && getChatFor(req.user.id, m.chat_id);
  if (!chat) return err(res, 404, 'e.message_not_found');

  const emoji = req.body?.emoji;
  const cur = q('SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?').get(m.id, req.user.id);
  if (!emoji || (cur && cur.emoji === emoji)) {
    q('DELETE FROM reactions WHERE message_id = ? AND user_id = ?').run(m.id, req.user.id);
  } else {
    if (typeof emoji !== 'string' || !EMOJI_RE.test(emoji)) return err(res, 400, 'e.bad_reaction');
    q(`INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)
       ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji`).run(m.id, req.user.id, emoji);
  }
  const reactions = getMessage(m.id).reactions;
  broadcast(chat, 'message:reaction', { chat_id: chat.id, message_id: m.id, reactions });
  res.json({ reactions });
});

router.post('/chats/:id/read', (req, res) => {
  const chat = getChatFor(req.user.id, toId(req.params.id));
  if (!chat) return err(res, 404, 'e.chat_not_found');
  const max = q('SELECT COALESCE(MAX(id), 0) AS m FROM messages WHERE chat_id = ?').get(chat.id).m;
  const last = Math.min(toId(req.body?.last_id), max);
  q(`INSERT INTO reads (chat_id, user_id, last_id) VALUES (?, ?, ?)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)`).run(chat.id, req.user.id, last);
  if (chat.type === 'dm' && chat.user_a !== chat.user_b)
    rt.emitToUsers([otherOf(chat, req.user.id)], 'chat:read', { chat_id: chat.id, user_id: req.user.id, last_id: last });
  res.json({ ok: true });
});

module.exports = router;
