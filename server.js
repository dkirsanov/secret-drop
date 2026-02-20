require('dotenv').config();
const express = require('express');
const { randomUUID } = require('crypto');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const MAX_DROPS = parseInt(process.env.MAX_DROPS || '1000', 10);
const MAX_SECRET_BYTES = parseInt(process.env.MAX_SECRET_BYTES || '65536', 10);
const DEFAULT_TTL_SECONDS = parseInt(process.env.DEFAULT_TTL_SECONDS || '900', 10);

const ALLOWED_TTL = new Set([300, 900, 3600]); // 5 min, 15 min, 1 hour
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_POSTS = 10;
const CLEANUP_INTERVAL_MS = 60 * 1000;

const app = express();
const drops = new Map(); // id -> { secret, expiresAt }
const postCountByIp = new Map(); // ip -> { count, resetAt }

app.use(express.json({ limit: MAX_SECRET_BYTES + 1024 }));
app.use(express.static(path.join(__dirname, 'public')));

function getClientIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function checkPostRateLimit(ip) {
  const now = Date.now();
  let entry = postCountByIp.get(ip);
  if (!entry) {
    postCountByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now >= entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_POSTS) return false;
  entry.count++;
  return true;
}

function cleanupExpired() {
  const now = Date.now();
  for (const [id, data] of drops.entries()) {
    if (data.expiresAt <= now) drops.delete(id);
  }
  for (const [ip, entry] of postCountByIp.entries()) {
    if (Date.now() >= entry.resetAt) postCountByIp.delete(ip);
  }
}

setInterval(cleanupExpired, CLEANUP_INTERVAL_MS);

app.post('/api/drop', (req, res) => {
  const ip = getClientIp(req);
  if (!checkPostRateLimit(ip)) {
    return res.status(429).json({ error: 'too many requests' });
  }

  const secret = req.body?.secret;
  if (typeof secret !== 'string') {
    return res.status(400).json({ error: 'secret is required' });
  }

  const secretBytes = Buffer.byteLength(secret, 'utf8');
  if (secretBytes > MAX_SECRET_BYTES) {
    return res.status(400).json({ error: 'secret too large' });
  }

  if (drops.size >= MAX_DROPS) {
    return res.status(503).json({ error: 'service full' });
  }

  let ttlSeconds = req.body?.ttl_seconds;
  if (ttlSeconds === undefined || ttlSeconds === null) {
    ttlSeconds = DEFAULT_TTL_SECONDS;
  } else {
    ttlSeconds = parseInt(ttlSeconds, 10);
    if (!Number.isInteger(ttlSeconds) || !ALLOWED_TTL.has(ttlSeconds)) {
      return res.status(400).json({ error: 'invalid ttl_seconds' });
    }
  }

  const id = randomUUID();
  const expiresAt = Date.now() + ttlSeconds * 1000;
  drops.set(id, { secret, expiresAt });

  const expiresAtIso = new Date(expiresAt).toISOString();
  console.log('drop created', { id, expires_at: expiresAtIso });
  res.status(201).json({ id, expires_at: expiresAtIso });
});

app.get('/api/drop/:id', (req, res) => {
  const id = req.params.id;
  const data = drops.get(id);
  if (!data) {
    return res.status(404).json({ error: 'not found' });
  }
  drops.delete(id);
  res.json({ secret: data.secret });
});

app.listen(PORT, () => {
  console.log(`SecretDrop listening on port ${PORT}`);
});
