const {
  STATE_COOKIE,
  requireEnv,
  getOrigin,
  randomState,
  serializeCookie,
  setNoStore,
} = require('./_utils');

module.exports = async function handler(req, res) {
  try {
    setNoStore(res);
    const origin = getOrigin(req);
    const redirectUri = `${origin}/api/auth-callback`;
    const state = randomState();

    res.setHeader('Set-Cookie', serializeCookie(STATE_COOKIE, state, {
      maxAge: 600,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    }));

    const params = new URLSearchParams({
      client_id: requireEnv('GOOGLE_CLIENT_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });

    res.statusCode = 302;
    res.setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    res.end();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(`Error de configuración OAuth: ${err.message}`);
  }
};
