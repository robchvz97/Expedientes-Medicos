const crypto = require('crypto');

const SESSION_COOKIE = 'expedientes_session';
const STATE_COOKIE = 'expedientes_oauth_state';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function getOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return raw.split(';').reduce((acc, part) => {
    const i = part.indexOf('=');
    if (i < 0) return acc;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) acc[k] = decodeURIComponent(v);
    return acc;
  }, {});
}

function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  return parts.join('; ');
}

function sessionKey() {
  const secret = requireEnv('SESSION_SECRET');
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encryptSession(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey(), iv);
  const plain = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(b => b.toString('base64url')).join('.');
}

function decryptSession(token) {
  const [ivB64, tagB64, dataB64] = String(token || '').split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Sesión inválida');
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const encrypted = Buffer.from(dataB64, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const payload = JSON.parse(plain.toString('utf8'));
  if (payload.exp && Date.now() > payload.exp) throw new Error('Sesión vencida');
  return payload;
}

function randomState() {
  return crypto.randomBytes(24).toString('base64url');
}

function setNoStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
}

function sendJson(res, status, data) {
  setNoStore(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function exchangeRefreshToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const json = await response.json();
  if (!response.ok) {
    const err = new Error(json.error_description || json.error || 'No se pudo renovar Google');
    err.code = json.error || 'token_error';
    throw err;
  }
  return json;
}

module.exports = {
  SESSION_COOKIE,
  STATE_COOKIE,
  requireEnv,
  getOrigin,
  parseCookies,
  serializeCookie,
  encryptSession,
  decryptSession,
  randomState,
  setNoStore,
  sendJson,
  exchangeRefreshToken,
};
