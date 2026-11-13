const jwt = require('jsonwebtoken');
const { SECRET } = require('./config');
const { q } = require('./db');

// A token is valid only if it was issued after the last password change
// (1 second of slack so a token minted right at the change is never rejected by clock rounding).
const tokenOk = (payload, user) => payload.iat >= Math.floor((user.pwd_at || 0) / 1000) - 1;

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: 'e.session_expired' });
  }
  const user = q('SELECT * FROM users WHERE id = ?').get(payload.uid);
  if (!user) return res.status(401).json({ error: 'e.user_missing' });
  if (!tokenOk(payload, user)) return res.status(401).json({ error: 'e.session_expired' });
  if (user.banned) return res.status(403).json({ error: 'e.banned', code: 'banned' });
  req.user = user;
  next();
}

const ownerOnly = (req, res, next) =>
  req.user.role === 'owner' ? next() : res.status(403).json({ error: 'e.owner_only' });

// iat is never earlier than the password-change second, so new tokens always pass and older ones never do.
const signToken = (user) => {
  const iat = Math.max(Math.floor(Date.now() / 1000), Math.floor((user.pwd_at || 0) / 1000));
  return jwt.sign({ uid: user.id, iat }, SECRET, { expiresIn: '30d' });
};

module.exports = { auth, ownerOnly, signToken, tokenOk };
