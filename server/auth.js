const jwt = require('jsonwebtoken');
const { SECRET } = require('./config');
const { q } = require('./db');

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  let uid;
  try {
    uid = jwt.verify(token, SECRET).uid;
  } catch {
    return res.status(401).json({ error: 'نشست شما پایان یافته است، دوباره وارد شوید' });
  }
  const user = q('SELECT * FROM users WHERE id = ?').get(uid);
  if (!user) return res.status(401).json({ error: 'حساب کاربری پیدا نشد' });
  if (user.banned) return res.status(403).json({ error: 'حساب شما مسدود شده است', code: 'banned' });
  req.user = user;
  next();
}

const ownerOnly = (req, res, next) =>
  req.user.role === 'owner' ? next() : res.status(403).json({ error: 'فقط مالک مجاز به انجام این کار است' });

const signToken = (user) => jwt.sign({ uid: user.id }, SECRET, { expiresIn: '30d' });

module.exports = { auth, ownerOnly, signToken };
