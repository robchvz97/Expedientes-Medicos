const { SESSION_COOKIE, serializeCookie, sendJson } = require('./_utils');

module.exports = async function handler(req, res) {
  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', {
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  }));
  return sendJson(res, 200, { ok: true });
};
