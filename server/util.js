const { q } = require('./db');
const rt = require('./realtime');

const pub = (u) =>
  u && {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    bio: u.bio,
    avatar: u.avatar || null,
    role: u.role,
    banned: !!u.banned,
    last_seen: u.last_seen || null,
  };

const toId = (v) => parseInt(v, 10) || 0;

/* ---------- messages ---------- */

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
    file: m.file_url
      ? { url: m.file_url, name: m.file_name, size: m.file_size, mime: m.file_mime, duration: m.duration }
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

/* ---------- chats ---------- */

function getChatFor(userId, chatId) {
  const c = q('SELECT * FROM chats WHERE id = ?').get(chatId);
  if (!c) return null;
  return c.type === 'group' || c.user_a === userId || c.user_b === userId ? c : null;
}

const otherOf = (chat, me) => (chat.user_a === me ? chat.user_b : chat.user_a);

function broadcast(chat, event, payload) {
  if (chat.type === 'group') rt.emitAll(event, payload);
  else rt.emitToUsers([chat.user_a, chat.user_b], event, payload);
}

const groupMeta = (c) => ({
  id: c.id,
  type: c.type,
  title: c.title,
  description: c.description,
  closed: !!c.closed,
  created_at: c.created_at,
});

function chatView(c, me) {
  const v = groupMeta(c);
  const mine = q('SELECT last_id FROM reads WHERE chat_id = ? AND user_id = ?').get(c.id, me);
  v.my_read = mine ? mine.last_id : 0;

  if (c.type === 'dm') {
    const other = otherOf(c, me);
    v.peer = pub(q('SELECT * FROM users WHERE id = ?').get(other));
    const pr = q('SELECT last_id FROM reads WHERE chat_id = ? AND user_id = ?').get(c.id, other);
    v.peer_read = pr ? pr.last_id : 0;
  }

  v.unread = q(
    'SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND id > ? AND (sender_id IS NULL OR sender_id <> ?)'
  ).get(c.id, v.my_read, me).n;

  const last = q(
    `SELECT m.id, m.type, m.text, m.created_at, m.sender_id, u.display_name AS sender_name
     FROM messages m LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = ? ORDER BY m.id DESC LIMIT 1`
  ).get(c.id);
  v.last = last || null;
  return v;
}

module.exports = { pub, toId, MSG_SELECT, hydrate, getMessage, getChatFor, otherOf, broadcast, groupMeta, chatView };
