const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

// Vercel Marketplace > Upstash Redis entegrasyonu UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN ortam değişkenlerini otomatik ekler.
// Lazy init: env değişkenleri yoksa Redis.fromEnv() hata fırlatır — bunu
// çağıran handler'ın try/catch'i yakalasın diye burada değil, çağrıldığında kurulur.
let kvInstance = null;
function getKv() {
  if (!kvInstance) kvInstance = Redis.fromEnv();
  return kvInstance;
}

function parseCookies(header) {
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

// Favoriler/geçmiş hesap sistemi olmadan cihaz bazlı ayrışsın diye
// anonim, uzun ömürlü bir clientId çereze yazılır.
function getClientId(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  let clientId = cookies.clientId;
  if (!clientId) {
    clientId = crypto.randomUUID();
    res.setHeader('Set-Cookie', `clientId=${clientId}; Path=/; Max-Age=31536000; SameSite=Lax`);
  }
  return clientId;
}

module.exports = { getKv, getClientId };
