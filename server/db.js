const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('./config');

const db = new Database(path.join(DATA_DIR, 'messenger.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

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

CREATE TABLE IF NOT EXISTS email_codes (
  email      TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  sent_at    INTEGER NOT NULL
);
`);

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
