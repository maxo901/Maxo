// Minimal in-memory rate limiter (per IP).
module.exports = function limiter({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    let h = hits.get(req.ip);
    if (!h || h.reset < now) {
      h = { count: 0, reset: now + windowMs };
      hits.set(req.ip, h);
    }
    if (++h.count > max) {
      return res.status(429).json({ error: message || 'تعداد درخواست‌ها زیاد است، کمی بعد دوباره تلاش کنید' });
    }
    next();
  };
};
