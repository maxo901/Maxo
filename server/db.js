const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('./config');

const db = new Database(path.join(DATA_DIR, 'messenger.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/* ---------- base schema (identical to v1 so old databases keep working) ---------- */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  avatar        TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  banned        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_seen     INTEGER
);

CREATE TABLE IF NOT EXISTS chats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL CHECK (type IN ('group','dm')),
  title       TEXT,
  description TEXT NOT NULL DEFAULT '',
  closed      INTEGER NOT NULL DEFAULT 0,
  user_a      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  user_b      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_by  INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dm ON chats(user_a, user_b) WHERE type = 'dm';

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT NOT NULL DEFAULT 'text',
  text       TEXT NOT NULL DEFAULT '',
  file_url   TEXT,
  file_name  TEXT,
  file_size  INTEGER,
  file_mime  TEXT,
  duration   INTEGER,
  reply_to   INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  edited_at  INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);

CREATE TABLE IF NOT EXISTS reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS reads (
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`);

/* ---------- v2 additions ---------- */
const hasCol = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);
const addCol = (t, c, def) => { if (!hasCol(t, c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };

addCol('users', 'settings', "TEXT NOT NULL DEFAULT '{}'");
addCol('users', 'show_online', 'INTEGER NOT NULL DEFAULT 1');
addCol('users', 'wallpaper', 'TEXT');
addCol('users', 'pwd_at', 'INTEGER NOT NULL DEFAULT 0');

addCol('chats', 'kind', "TEXT NOT NULL DEFAULT 'group'"); // group | channel (only meaningful when type = 'group')
addCol('chats', 'avatar', 'TEXT');
addCol('chats', 'official', 'INTEGER NOT NULL DEFAULT 0'); // owner-made: every user is a member, nobody can leave
addCol('chats', 'invite_code', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_invite ON chats(invite_code) WHERE invite_code IS NOT NULL');

addCol('messages', 'fwd_name', 'TEXT');
addCol('messages', 'media_w', 'INTEGER');
addCol('messages', 'media_h', 'INTEGER');

db.exec(`
CREATE TABLE IF NOT EXISTS chat_members (
  chat_id   INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id);

CREATE TABLE IF NOT EXISTS message_hides (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_clears (
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS stories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  file_url   TEXT NOT NULL,
  file_mime  TEXT,
  caption    TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stories_exp ON stories(expires_at);

CREATE TABLE IF NOT EXISTS story_views (
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seen_at  INTEGER NOT NULL,
  PRIMARY KEY (story_id, user_id)
);

DROP TABLE IF EXISTS email_codes;
`);

const getMeta = (k) => (db.prepare('SELECT value FROM meta WHERE key = ?').get(k) || {}).value;
const setMeta = (k, v) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));

// One-time upgrade: groups from v1 were all owner-made => official; every existing user joins them.
if (!getMeta('v2_members')) {
  db.transaction(() => {
    db.exec("UPDATE chats SET official = 1 WHERE type = 'group'");
    db.prepare(
      `INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at)
       SELECT c.id, u.id, CASE WHEN u.role = 'owner' THEN 'admin' ELSE 'member' END, ?
       FROM chats c, users u WHERE c.type = 'group'`
    ).run(Date.now());
    setMeta('v2_members', 1);
  })();
}

// Tiny prepared-statement cache: q('SELECT ...').get(...)
const cache = new Map();
function q(sql) {
  let st = cache.get(sql);
  if (!st) {
    st = db.prepare(sql);
    cache.set(sql, st);
  }
  return st;
}

module.exports = { db, q };
