const crypto = require('crypto');
const { q } = require('./db');
const rt = require('./realtime');
const { removeFile } = require('./upload');

/* ---------- users ---------- */

// `viewer` = id of whoever receives this object (0 = broadcast to others).
// People who hid their online status look "last seen recently" to everybody else.
const pub = (u, viewer = 0) => {
  if (!u) return u;
  const hide = u.show_online === 0 && viewer !== u.id;
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    bio: u.bio,
    avatar: u.avatar || null,
    role: u.role,
    banned: !!u.banned,
    created_at: u.created_at,
    last_seen: hide ? null : u.last_seen || null,
    presence_hidden: hide,
  };
};

const toId = (v) => parseInt(v, 10) || 0;
const randomCode = () => crypto.randomBytes(9).toString('base64url');

/* ---------- files shared between rows (forwarded messages, etc.) ---------- */

const fileInUse = (url) =>
  !!(q('SELECT 1 FROM messages WHERE file_url = ? LIMIT 1').get(url) ||
    q('SELECT 1 FROM users WHERE avatar = ? OR wallpaper = ? LIMIT 1').get(url, url) ||
    q('SELECT 1 FROM chats WHERE avatar = ? LIMIT 1').get(url) ||
    q('SELECT 1 FROM stories WHERE file_url = ? LIMIT 1').get(url));

// Call AFTER the rows were deleted: removes only files nobody references any more.
function purgeFiles(urls) {
  for (const u of new Set((urls || []).filter(Boolean))) if (!fileInUse(u)) removeFile(u);
}

/* ---------- messages ---------- */

const NOT_HIDDEN = 'NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.message_id = m.id AND h.user_id = ?)';

const MSG_SELECT = `
  SELECT m.*, u.username AS s_username, u.display_name AS s_name, u.avatar AS s_avatar,
         r.id AS r_id, r.type AS r_type, r.text AS r_text, ru.display_name AS r_name
  FROM messages m
  LEFT JOIN users u  ON u.id = m.sender_id
  LEFT JOIN messages r ON r.id = m.reply_to
  LEFT JOIN users ru ON ru.id = r.sender_id`;

function hydrate(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const reacts = q(
    `SELECT message_id, emoji, user_id FROM reactions WHERE message_id IN (${ids.map(() => '?').join(',')}) ORDER BY rowid`
  ).all(...ids);

  const byMsg = new Map();
  for (const x of reacts) {
    if (!byMsg.has(x.message_id)) byMsg.set(x.message_id, new Map());
    const m = byMsg.get(x.message_id);
    if (!m.has(x.emoji)) m.set(x.emoji, []);
    m.get(x.emoji).push(x.user_id);
  }

  return rows.map((m) => ({
    id: m.id,
    chat_id: m.chat_id,
    type: m.type,
    text: m.text,
    created_at: m.created_at,
    edited_at: m.edited_at,
    fwd: m.fwd_name || null,
    file: m.file_url
      ? { url: m.file_url, name: m.file_name, size: m.file_size, mime: m.file_mime, duration: m.duration, w: m.media_w, h: m.media_h }
      : null,
    sender: m.sender_id
      ? { id: m.sender_id, username: m.s_username, display_name: m.s_name, avatar: m.s_avatar }
      : null,
    reply: m.r_id ? { id: m.r_id, type: m.r_type, text: (m.r_text || '').slice(0, 120), name: m.r_name || null } : null,
    reactions: [...(byMsg.get(m.id) || new Map())].map(([emoji, users]) => ({ emoji, users })),
  }));
}

const getMessage = (id) => {
  const row = q(MSG_SELECT + ' WHERE m.id = ?').get(id);
  return row ? hydrate([row])[0] : null;
};

/* ---------- chats & membership ---------- */

const memberRow = (chatId, uid) => q('SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, uid);

function getChatFor(userId, chatId) {
  const c = q('SELECT * FROM chats WHERE id = ?').get(chatId);
  if (!c) return null;
  if (c.type === 'dm') return c.user_a === userId || c.user_b === userId ? c : null;
  return memberRow(c.id, userId) ? c : null;
}

const otherOf = (chat, me) => (chat.user_a === me ? chat.user_b : chat.user_a);

const memberIds = (chat) =>
  chat.type === 'dm'
    ? [...new Set([chat.user_a, chat.user_b])]
    : q('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chat.id).map((r) => r.user_id);

const broadcast = (chat, event, payload) => rt.emitToUsers(memberIds(chat), event, payload);

// Admins of a group/channel, plus the site owner in official (owner-made) groups.
function canManage(chat, user) {
  if (chat.type !== 'group') return false;
  const m = memberRow(chat.id, user.id);
  return !!(m && m.role === 'admin') || (user.role === 'owner' && !!chat.official && !!m);
}

function canPost(chat, user) {
  if (chat.type === 'dm') return true;
  if (!memberRow(chat.id, user.id)) return false;
  if (chat.closed || chat.kind === 'channel') return canManage(chat, user);
  return true;
}

const clearFloor = (chatId, userId) => {
  const r = q('SELECT last_id FROM chat_clears WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
  return r ? r.last_id : 0;
};

function ensureSaved(userId) {
  let c = q("SELECT * FROM chats WHERE type = 'dm' AND user_a = ? AND user_b = ?").get(userId, userId);
  if (!c) {
    const info = q("INSERT INTO chats (type, user_a, user_b, created_by, created_at) VALUES ('dm', ?, ?, ?, ?)").run(userId, userId, userId, Date.now());
    c = q('SELECT * FROM chats WHERE id = ?').get(info.lastInsertRowid);
  }
  return c;
}

const groupMeta = (c) => ({
  id: c.id,
  type: c.type,
  kind: c.kind || 'group',
  title: c.title,
  description: c.description,
  closed: !!c.closed,
  official: !!c.official,
  avatar: c.avatar || null,
  created_at: c.created_at,
  members: c.type === 'group' ? q('SELECT COUNT(*) AS n FROM chat_members WHERE chat_id = ?').get(c.id).n : undefined,
});

function chatView(c, me) {
  const v = groupMeta(c);
  const mine = q('SELECT last_id FROM reads WHERE chat_id = ? AND user_id = ?').get(c.id, me.id);
  const floor = clearFloor(c.id, me.id);
  v.my_read = mine ? mine.last_id : 0;

  if (c.type === 'dm') {
    const other = otherOf(c, me.id);
    v.saved = c.user_a === c.user_b;
    v.peer = pub(q('SELECT * FROM users WHERE id = ?').get(other), me.id);
    const pr = q('SELECT last_id FROM reads WHERE chat_id = ? AND user_id = ?').get(c.id, other);
    v.peer_read = pr ? pr.last_id : 0;
  } else {
    const mr = memberRow(c.id, me.id);
    v.my_role = mr ? mr.role : null;
    v.can_manage = canManage(c, me);
    v.invite_code = mr && !c.official ? c.invite_code : null;
  }

  v.unread = q(
    `SELECT COUNT(*) AS n FROM messages m WHERE m.chat_id = ? AND m.id > ? AND (m.sender_id IS NULL OR m.sender_id <> ?) AND ${NOT_HIDDEN}`
  ).get(c.id, Math.max(v.my_read, floor), me.id, me.id).n;

  v.last =
    q(
      `SELECT m.id, m.type, m.text, m.created_at, m.sender_id, u.display_name AS sender_name
       FROM messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = ? AND m.id > ? AND ${NOT_HIDDEN} ORDER BY m.id DESC LIMIT 1`
    ).get(c.id, floor, me.id) || null;
  return v;
}

module.exports = {
  pub, toId, randomCode, purgeFiles, NOT_HIDDEN, MSG_SELECT, hydrate, getMessage,
  getChatFor, otherOf, memberRow, memberIds, broadcast, canManage, canPost, clearFloor,
  ensureSaved, groupMeta, chatView,
};
