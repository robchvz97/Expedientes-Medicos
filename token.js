const {
  SESSION_COOKIE,
  parseCookies,
  decryptSession,
  serializeCookie,
  sendJson,
  exchangeRefreshToken,
} = require('./_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  const cookies = parseCookies(req);
  const sessionToken = cookies[SESSION_COOKIE];
  if (!sessionToken) return sendJson(res, 401, { authenticated: false });

  try {
    const session = decryptSession(sessionToken);
    const token = await exchangeRefreshToken(session.refreshToken);
    return sendJson(res, 200, {
      authenticated: true,
      access_token: token.access_token,
      expires_in: token.expires_in || 3600,
      token_type: token.token_type || 'Bearer',
    });
  } catch (err) {
    if (err.code === 'invalid_grant' || /sesión/i.test(err.message)) {
      res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', {
        maxAge: 0,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      }));
    }
    return sendJson(res, 401, { authenticated: false, error: err.code || 'session_invalid' });
  }
};
