// Expedientes Médicos v4.1
// Sesión persistente en Vercel + opción segura para eliminar pacientes de la app.
window.EXPEDIENTES_CONFIG = {
  googleClientId: "1075750355168-54100pbjjv8irqqt521va92nr8m11mki.apps.googleusercontent.com"
};

(() => {
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

    const clear = document.getElementById('clearClientId');
    if (clear) {
      clear.textContent = 'Cerrar sesión';
      clear.onclick = logoutServer;
    }

    const save = document.getElementById('saveClientId');
    if (save) save.closest?.('.button-row')?.classList.add('hidden');
  }

  async function removePatientFromApp(patient) {
    const ok = confirm(
      `¿Eliminar a ${patient.fullName || 'este paciente'} de la aplicación?\n\n` +
      'Se quitará de la lista y de los totales. El historial seguirá conservado como respaldo en Google Sheets/Drive.'
    );
    if (!ok) return;

    const verification = prompt('Para confirmar, escribe ELIMINAR:');
    if (String(verification || '').trim().toUpperCase() !== 'ELIMINAR') {
      toast('Eliminación cancelada');
      return;
    }

    try {
      busy(true, 'Eliminando paciente…');
      await appendRecord('Patients', {
        ...patient,
        updatedAt: now(),
        deletedAt: now()
      });
      await refreshData();
      currentPatientId = null;
      showView('patientsView');
      toast('Paciente eliminado de la aplicación');
    } catch (err) {
      friendlyError(err);
    } finally {
      busy(false);
    }
  }

  function installDeletePatientButton() {
    if (typeof window.bindPatientDetail !== 'function') return;
    if (window.__deletePatientInstalled) return;
    window.__deletePatientInstalled = true;

    const originalBind = window.bindPatientDetail;
    window.bindPatientDetail = function(patient) {
      originalBind(patient);

      const actions = document.querySelector('.hero-actions');
      if (!actions || document.getElementById('deletePatientBtn')) return;

      const btn = document.createElement('button');
      btn.id = 'deletePatientBtn';
      btn.type = 'button';
      btn.textContent = 'Eliminar';
      btn.style.background = '#fff';
      btn.style.color = '#b91c1c';
      btn.style.border = '1px solid #fecaca';
      btn.onclick = () => removePatientFromApp(patient);
      actions.appendChild(btn);
    };
  }

  async function initPersistentSession() {
    wirePersistentButtons();
    installDeletePatientButton();

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
