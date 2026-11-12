const path = require('path');
const http = require('http');
const express = require('express');
const multer = require('multer');
const cfg = require('./config');
const { db } = require('./db');
const rt = require('./realtime');
const { auth } = require('./auth');

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
app.use('/api', auth, require('./routes/users'), require('./routes/chats'));
app.use('/api', (req, res) => res.status(404).json({ error: 'پیدا نشد' }));

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'حجم فایل بیشتر از حد مجاز است' : 'آپلود فایل ناموفق بود';
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg });
  }
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'درخواست نامعتبر است' });
  console.error(err);
  res.status(500).json({ error: 'خطای سرور' });
});

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
