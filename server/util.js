const { q } = require('./db');
const rt = require('./realtime');
const { removeFile } = require('./upload');

const pub = (u) =>
  u && {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    bio: u.bio,
    avatar: u.avatar || null,
    role: u.role,
    banned: !!u.banned,
    created_at: u.created_at,
    last_seen: u.show_online === 0 ? null : u.last_seen || null,
  };

const toId = (v) => parseInt(v, 10) || 0;
const isGroupish = (c) => c.type === 'group' || c.type === 'channel';

/* ---------- files ---------- */
function releaseFile(url) {
  if (!url) return;
  const n = q(`SELECT (SELECT COUNT(*) FROM messages WHERE file_url = ?) + (SELECT COUNT(*) FROM users WHERE avatar = ?)
             + (SELECT COUNT(*) FROM chats WHERE avatar = ?) + (SELECT COUNT(*) FROM stories WHERE file_url = ?) AS n`).get(url, url, url, url).n;
  if (!n) removeFile(url);
}

/* ---------- messages ---------- */
const MSG_SELECT = `
  SELECT m.*, u.username AS s_username, u.display_name AS s_name, u.avatar AS s_avatar,
         r.id AS r_id, r.type AS r_type, r.text AS r_text, ru.display_name AS r_name
  FROM messages m
  LEFT JOIN users u  ON u.id = m.sender_id
  LEFT JOIN messages r ON r.id = m.reply_to
  LEFT JOIN users ru ON ru.id = r.sender_id`;
const NOT_HIDDEN = ' AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.message_id = m.id AND h.user_id = ?)';

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
    id: m.id, chat_id: m.chat_id, type: m.type, text: m.text, created_at: m.created_at, edited_at: m.edited_at,
    fwd: m.fwd_name || null,
    file: m.file_url ? { url: m.file_url, name: m.file_name, size: m.file_size, mime: m.file_mime, duration: m.duration } : null,
    sender: m.sender_id ? { id: m.sender_id, username: m.s_username, display_name: m.s_name, avatar: m.s_avatar } : null,
    reply: m.r_id ? { id: m.r_id, type: m.r_type, text: (m.r_text || '').slice(0, 120), name: m.r_name || null } : null,
    reactions: [...(byMsg.get(m.id) || new Map())].map(([emoji, users]) => ({ emoji, users })),
  }));
}

const getMessage = (id) => {
  const row = q(MSG_SELECT + ' WHERE m.id = ?').get(id);
  return row ? hydrate([row])[0] : null;
};

/* ---------- chats ---------- */
function getChatFor(userId, chatId) {
  const c = q('SELECT * FROM chats WHERE id = ?').get(chatId);
  if (!c) return null;
  if (c.type === 'dm') return c.user_a === userId || c.user_b === userId ? c : null;
  if (c.type === 'saved') return c.user_a === userId ? c : null;
  return q('SELECT 1 FROM members WHERE chat_id = ? AND user_id = ?').get(c.id, userId) ? c : null;
}

const otherOf = (chat, me) => (chat.user_a === me ? chat.user_b : chat.user_a);

function audience(chat) {
  if (chat.type === 'dm') return [chat.user_a, chat.user_b];
  if (chat.type === 'saved') return [chat.user_a];
  return q('SELECT user_id FROM members WHERE chat_id = ?').all(chat.id).map((r) => r.user_id);
}

const broadcast = (chat, event, payload) => rt.emitToUsers(audience(chat), event, payload);

function canPost(chat, user) {
  if (chat.type === 'dm' || chat.type === 'saved') return true;
  if (chat.created_by === user.id) return true;
  return chat.type === 'group' && !chat.closed;
}

function ensureSaved(uid) {
  let c = q("SELECT * FROM chats WHERE type = 'saved' AND user_a = ?").get(uid);
  if (!c) {
    const i = q("INSERT INTO chats (type, user_a, user_b, created_by, created_at) VALUES ('saved', ?, ?, ?, ?)").run(uid, uid, uid, Date.now());
    c = q('SELECT * FROM chats WHERE id = ?').get(i.lastInsertRowid);
  }
  return c;
}

// called after a new account is created: saved messages + every owner chat
function onUserCreated(uid) {
  ensureSaved(uid);
  q(`INSERT OR IGNORE INTO members (chat_id, user_id, role, joined_at)
     SELECT id, ?, 'member', ? FROM chats WHERE forced = 1 AND type IN ('group','channel')`).run(uid, Date.now());
}

const groupMeta = (c) => ({
  id: c.id, type: c.type, title: c.title, description: c.description, avatar: c.avatar || null,
  closed: !!c.closed, forced: !!c.forced, created_by: c.created_by, created_at: c.created_at,
  members_count: isGroupish(c) ? q('SELECT COUNT(*) AS n FROM members WHERE chat_id = ?').get(c.id).n : undefined,
});

function chatView(c, me) {
  const v = groupMeta(c);
  const st = q('SELECT last_id, cleared_id FROM reads WHERE chat_id = ? AND user_id = ?').get(c.id, me) || { last_id: 0, cleared_id: 0 };
  v.my_read = st.last_id;

  if (c.type === 'dm') {
    const other = otherOf(c, me);
    v.peer = pub(q('SELECT * FROM users WHERE id = ?').get(other));
    const pr = q('SELECT last_id FROM reads WHERE chat_id = ? AND user_id = ?').get(c.id, other);
    v.peer_read = pr ? pr.last_id : 0;
  }
  if (isGroupish(c) && c.created_by === me) {
    if (!c.invite_code) {
      c.invite_code = require('crypto').randomBytes(9).toString('base64url');
      q('UPDATE chats SET invite_code = ? WHERE id = ?').run(c.invite_code, c.id);
    }
    v.invite_code = c.invite_code;
  }

  const floor = Math.max(st.last_id, st.cleared_id);
  v.unread = q(`SELECT COUNT(*) AS n FROM messages m WHERE m.chat_id = ? AND m.id > ? AND (m.sender_id IS NULL OR m.sender_id <> ?)${NOT_HIDDEN}`)
    .get(c.id, floor, me, me).n;
  v.last = q(`SELECT m.id, m.type, m.text, m.created_at, m.sender_id, u.display_name AS sender_name
     FROM messages m LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = ? AND m.id > ?${NOT_HIDDEN} ORDER BY m.id DESC LIMIT 1`).get(c.id, st.cleared_id, me) || null;
  return v;
}

module.exports = {
  pub, toId, isGroupish, releaseFile, MSG_SELECT, NOT_HIDDEN, hydrate, getMessage,
  getChatFor, otherOf, audience, broadcast, canPost, ensureSaved, onUserCreated, groupMeta, chatView,
};
