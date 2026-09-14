// Expedientes Médicos v4
// En GitHub Pages mantiene el flujo anterior. En Vercel usa OAuth de servidor con cookie HttpOnly,
// por lo que la sesión puede recuperarse al volver a abrir la app sin elegir la cuenta cada vez.
window.EXPEDIENTES_CONFIG = {
  googleClientId: "1075750355168-54100pbjjv8irqqt521va92nr8m11mki.apps.googleusercontent.com"
};

(() => {
  // El modo persistente solo se activa cuando la app se sirve desde Vercel.
  // Así puedes subir esta versión al repositorio sin romper temporalmente GitHub Pages.
  const persistentMode = /\.vercel\.app$/i.test(location.hostname) || location.hostname === 'localhost';
  if (!persistentMode) return;

  let tokenRefreshTimer = null;

  async function getServerToken({ quiet = false } = {}) {
    try {
      if (!quiet && typeof busy === 'function') busy(true, 'Abriendo sesión segura…');
      const res = await fetch('/api/token', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.access_token) return false;

      accessToken = data.access_token;
      accountInfo = await apiJson('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)');
      accountInfo = accountInfo?.user || null;

      await ensureStorage();
      await refreshData();
      markConnected();
      showView('patientsView');

      clearTimeout(tokenRefreshTimer);
      const refreshMs = Math.max(60_000, ((Number(data.expires_in || 3600) - 300) * 1000));
      tokenRefreshTimer = setTimeout(() => getServerToken({ quiet: true }), refreshMs);
      return true;
    } catch (err) {
      console.warn('No se pudo recuperar la sesión persistente:', err);
      return false;
    } finally {
      if (!quiet && typeof busy === 'function') busy(false);
    }
  }

  function startServerLogin() {
    location.href = '/api/auth-start';
  }

  async function logoutServer() {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (_) {}
    accessToken = '';
    accountInfo = null;
    storage = { spreadsheetId: '', rootFolderId: '' };
    records = { patients: [], visits: [], payments: [], files: [] };
    clearTimeout(tokenRefreshTimer);
    markDisconnected('Sesión cerrada. Toca “Conectar con Google” para entrar de nuevo.');
    showView('setupView');
  }

  function wirePersistentButtons() {
    ['connectGoogleBtn', 'setupConnectBtn', 'settingsConnect'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.onclick = startServerLogin;
    });

    // Convierte el botón "Quitar" de Client ID en cierre de sesión cuando estamos en Vercel.
    const clear = document.getElementById('clearClientId');
    if (clear) {
      clear.textContent = 'Cerrar sesión';
      clear.onclick = logoutServer;
    }

    const save = document.getElementById('saveClientId');
    if (save) save.closest?.('.button-row')?.classList.add('hidden');
  }

  async function initPersistentSession() {
    wirePersistentButtons();
    const ok = await getServerToken({ quiet: true });
    if (!ok) {
      markDisconnected('Conecta Google una sola vez en este dispositivo. Después la sesión se restaurará automáticamente.');
      showView('setupView');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initPersistentSession, 0), { once: true });
  } else {
    setTimeout(initPersistentSession, 0);
  }
})();
