const {
  SESSION_COOKIE,
  STATE_COOKIE,
  requireEnv,
  getOrigin,
  parseCookies,
  serializeCookie,
  encryptSession,
  setNoStore,
} = require('./_utils');

module.exports = async function handler(req, res) {
  try {
    setNoStore(res);
    const origin = getOrigin(req);
    const cookies = parseCookies(req);
    const url = new URL(req.url, origin);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) throw new Error(`Google devolvió: ${error}`);
    if (!code) throw new Error('No llegó el código de autorización de Google.');
    if (!state || !cookies[STATE_COOKIE] || state !== cookies[STATE_COOKIE]) {
      throw new Error('La validación de seguridad (state) no coincide.');
    }

    const redirectUri = `${origin}/api/auth-callback`;
    const body = new URLSearchParams({
      code,
      client_id: requireEnv('GOOGLE_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(token.error_description || token.error || 'No se pudo intercambiar el código OAuth.');
    }
    if (!token.refresh_token) {
      throw new Error('Google no entregó refresh_token. Revoca el acceso de la app en tu cuenta de Google y vuelve a conectar.');
    }

    // La cookie contiene el refresh_token cifrado con SESSION_SECRET y nunca queda disponible al JavaScript del navegador.
    const maxAge = 60 * 60 * 24 * 180; // 180 días en el dispositivo
    const session = encryptSession({
      refreshToken: token.refresh_token,
      createdAt: Date.now(),
      exp: Date.now() + maxAge * 1000,
    });

    res.setHeader('Set-Cookie', [
      serializeCookie(SESSION_COOKIE, session, {
        maxAge,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      }),
      serializeCookie(STATE_COOKIE, '', {
        maxAge: 0,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      }),
    ]);

    res.statusCode = 302;
    res.setHeader('Location', `${origin}/?google=connected`);
    res.end();
  } catch (err) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error OAuth</title><body style="font-family:system-ui;padding:24px;max-width:680px;margin:auto"><h1>No se pudo conectar Google</h1><p>${String(err.message).replace(/[<>&]/g,'')}</p><p><a href="/">Volver a la app</a></p></body>`);
  }
};
