const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('./config');

const db = new Database(path.join(DATA_DIR, 'messenger.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const CHATS_DDL = (name) => `CREATE TABLE ${name} (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,                 -- group | channel | dm | saved
  title       TEXT,
  description TEXT NOT NULL DEFAULT '',
  avatar      TEXT,
  invite_code TEXT UNIQUE,
  forced      INTEGER NOT NULL DEFAULT 0,    -- owner's chats: everyone is a member, nobody can leave
  closed      INTEGER NOT NULL DEFAULT 0,
  user_a      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  user_b      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_by  INTEGER,
  created_at  INTEGER NOT NULL
)`;

const hasTable = (n) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n);
const columns = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const addCol = (t, c, def) => { if (hasTable(t) && !columns(t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };

// v1 -> v2: old chats table had a CHECK(type IN ('group','dm')); rebuild it (official 12-step procedure).
if (hasTable('chats') && !columns('chats').includes('forced')) {
  db.pragma('foreign_keys = OFF');
  db.exec(`BEGIN;
    ${CHATS_DDL('chats_new')};
    INSERT INTO chats_new (id,type,title,description,closed,user_a,user_b,created_by,created_at,forced)
      SELECT id,type,title,description,closed,user_a,user_b,created_by,created_at, CASE WHEN type='group' THEN 1 ELSE 0 END FROM chats;
    DROP TABLE chats;
    ALTER TABLE chats_new RENAME TO chats;
  COMMIT;`);
}
db.pragma('foreign_keys = ON');

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
  show_online   INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  last_seen     INTEGER
);
${hasTable('chats') ? '' : CHATS_DDL('chats') + ';'}
CREATE UNIQUE INDEX IF NOT EXISTS uq_dm    ON chats(user_a, user_b) WHERE type = 'dm';
CREATE UNIQUE INDEX IF NOT EXISTS uq_saved ON chats(user_a) WHERE type = 'saved';

CREATE TABLE IF NOT EXISTS members (
  chat_id   INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);

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
  fwd_name   TEXT,
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
  chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_id    INTEGER NOT NULL DEFAULT 0,
  cleared_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS hidden (          -- "delete for me"
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS stories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  file_url   TEXT NOT NULL,
  caption    TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS story_views (
  story_id  INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (story_id, user_id)
);
`);

// columns added after v1 (safe on fresh DBs too)
addCol('users', 'show_online', 'INTEGER NOT NULL DEFAULT 1');
addCol('reads', 'cleared_id', 'INTEGER NOT NULL DEFAULT 0');
addCol('messages', 'fwd_name', 'TEXT');

// owner's chats always contain every user (idempotent, runs at each boot)
db.prepare(`INSERT OR IGNORE INTO members (chat_id, user_id, role, joined_at)
  SELECT c.id, u.id, CASE WHEN u.id = c.created_by THEN 'owner' ELSE 'member' END, ? FROM chats c JOIN users u
  WHERE c.forced = 1 AND c.type IN ('group','channel')`).run(Date.now());

const cache = new Map();
function q(sql) {
  let st = cache.get(sql);
  if (!st) { st = db.prepare(sql); cache.set(sql, st); }
  return st;
}

module.exports = { db, q };
