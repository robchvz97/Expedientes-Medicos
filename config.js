// Expedientes Médicos — configuración Google + reconexión automática v3
// El Client ID es público por diseño. No coloques aquí ningún Client Secret.
window.EXPEDIENTES_CONFIG = {
  googleClientId: "1075750355168-54100pbjjv8irqqt521va92nr8m11mki.apps.googleusercontent.com"
};

(() => {
  const REMEMBER_KEY = 'expedientes_google_remember_v3';

  async function smartConnectGoogle(forceConsent = false, silentAttempt = false) {
    try {
      const tc = await ensureTokenClient();
      busy(true, silentAttempt ? 'Reconectando con Google…' : 'Conectando con Google…');

      await new Promise((resolve, reject) => {
        connectResolve = resolve;
        connectReject = reject;
        tc.requestAccessToken({ prompt: forceConsent ? 'consent' : '' });
      });

      localStorage.setItem(REMEMBER_KEY, '1');

      accountInfo = await apiJson(
        'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)'
      );
      accountInfo = accountInfo?.user || null;

      await ensureStorage();
      await refreshData();
      markConnected();
      showView('patientsView');

      if (!silentAttempt) toast('Google Drive conectado');
      return true;
    } catch (err) {
      console.warn('Reconexión Google:', err);

      if (silentAttempt) {
        markDisconnected('Toca “Conectar con Google” para renovar el acceso.');
      } else {
        friendlyError(err);
      }
      return false;
    } finally {
      busy(false);
      connectResolve = null;
      connectReject = null;
    }
  }

  window.addEventListener('load', () => {
    const remembered = localStorage.getItem(REMEMBER_KEY) === '1';

    // Reemplaza los botones originales para que, después del primer consentimiento,
    // intenten renovar acceso sin volver a mostrar la pantalla de consentimiento.
    ['connectGoogleBtn', 'setupConnectBtn', 'settingsConnect'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onclick = () => smartConnectGoogle(
        localStorage.getItem(REMEMBER_KEY) !== '1',
        false
      );
    });

    // Si ya se conectó anteriormente en este dispositivo, intenta reabrir
    // la sesión automáticamente usando la sesión activa de Google.
    if (remembered && getClientId()) {
      setTimeout(() => smartConnectGoogle(false, true), 350);
    }
  });
})();
