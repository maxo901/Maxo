const path = require('path');
const http = require('http');
const express = require('express');
const multer = require('multer');
const cfg = require('./config');
const { db } = require('./db');
const rt = require('./realtime');
const { auth } = require('./auth');
const { q } = require('./db');
const { purgeFiles } = require('./util');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '100kb' }));

app.get('/healthz', (req, res) => res.send('ok'));
app.get('/api/config', (req, res) => res.json({ app_name: cfg.APP_NAME, max_upload_mb: cfg.MAX_UPLOAD_MB }));

app.use(
  '/uploads',
  express.static(cfg.UPLOADS_DIR, {
    index: false,
    maxAge: '30d',
    immutable: true,
    setHeaders: (res, file) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (file.endsWith('.bin')) res.setHeader('Content-Disposition', 'attachment');
    },
  })
);

app.use('/api/auth', require('./routes/auth'));
app.use('/api', auth, require('./routes/users'), require('./routes/chats'), require('./routes/stories'));
app.use('/api', (req, res) => res.status(404).json({ error: 'e.not_found' }));

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'e.too_large' : 'e.upload_failed';
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg });
  }
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'e.bad_request' });
  console.error(err);
  res.status(500).json({ error: 'e.server_error' });
});

// expired stories (and their files) are removed every 10 minutes
function sweepStories() {
  try {
    const old = q('SELECT id, file_url FROM stories WHERE expires_at <= ?').all(Date.now());
    if (!old.length) return;
    old.forEach((s) => q('DELETE FROM stories WHERE id = ?').run(s.id));
    purgeFiles(old.map((s) => s.file_url));
  } catch (e) { console.error('[sweep]', e.message); }
}
setInterval(sweepStories, 10 * 60 * 1000).unref();
sweepStories();

const server = http.createServer(app);
rt.init(server);
server.listen(cfg.PORT, '0.0.0.0', () => console.log(`Messenger running on port ${cfg.PORT} (data: ${cfg.DATA_DIR})`));

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
