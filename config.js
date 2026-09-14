// Expedientes Médicos v4.2
// Sesión persistente en Vercel + interfaz limpia + eliminar paciente.
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
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      if (!res.ok) return false;
      const data = await res.json();
      if (!data.access_token) return false;

      accessToken = data.access_token;

      accountInfo = await apiJson(
        'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)'
      );
      accountInfo = accountInfo?.user || null;

      await ensureStorage();
      await refreshData();
      markConnected();
      cleanConnectedBanner();
      showView('patientsView');

      clearTimeout(tokenRefreshTimer);
      const refreshMs = Math.max(
        60_000,
        (Number(data.expires_in || 3600) - 300) * 1000
      );
      tokenRefreshTimer = setTimeout(
        () => getServerToken({ quiet: true }),
        refreshMs
      );

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
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });
    } catch (_) {}

    accessToken = '';
    accountInfo = null;
    storage = { spreadsheetId: '', rootFolderId: '' };
    records = { patients: [], visits: [], payments: [], files: [] };
    clearTimeout(tokenRefreshTimer);

    markDisconnected(
      'Sesión cerrada. Toca “Conectar con Google” para entrar de nuevo.'
    );
    cleanConnectedBanner();
    showView('setupView');
  }

  function cleanConnectedBanner() {
    const banner = document.getElementById('cloudBanner');
    const button = document.getElementById('connectGoogleBtn');
    if (!banner || !button) return;

    const connected = banner.classList.contains('connected');

    if (connected) {
      // Ya hay sesión válida: no mostramos "Renovar acceso".
      button.style.display = 'none';
    } else {
      button.style.display = '';
      button.textContent = 'Conectar con Google';
    }
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

    const settingsConnect = document.getElementById('settingsConnect');
    if (settingsConnect) settingsConnect.textContent = 'Volver a conectar Google';

    const banner = document.getElementById('cloudBanner');
    if (banner) {
      new MutationObserver(cleanConnectedBanner).observe(banner, {
        attributes: true,
        childList: true,
        subtree: true
      });
    }

    cleanConnectedBanner();
  }

  async function deleteCurrentPatient(patient) {
    const name = patient?.fullName || 'este paciente';

    const first = confirm(
      `¿Eliminar a ${name} de la aplicación?\n\n` +
      'Se quitará de la lista de pacientes y de los totales. ' +
      'Sus datos quedarán conservados como respaldo en Google Sheets/Drive.'
    );
    if (!first) return;

    const word = prompt('Para confirmar, escribe ELIMINAR');
    if (String(word || '').trim().toUpperCase() !== 'ELIMINAR') {
      if (typeof toast === 'function') toast('Eliminación cancelada');
      return;
    }

    try {
      if (typeof busy === 'function') busy(true, 'Eliminando paciente…');

      const deletedAt = new Date().toISOString();
      await appendRecord('Patients', {
        ...patient,
        updatedAt: deletedAt,
        deletedAt
      });

      await refreshData();
      currentPatientId = null;
      showView('patientsView');

      if (typeof toast === 'function') toast('Paciente eliminado');
    } catch (err) {
      if (typeof friendlyError === 'function') friendlyError(err);
      else alert(String(err?.message || err));
    } finally {
      if (typeof busy === 'function') busy(false);
    }
  }

  function ensureDeletePatientButton() {
    const detail = document.getElementById('patientDetail');
    if (!detail || !detail.innerHTML.trim()) return;

    const heroActions = detail.querySelector('.hero-actions');
    if (!heroActions) return;

    if (document.getElementById('deletePatientBtn')) return;

    const patient =
      typeof records !== 'undefined'
        ? records.patients.find(
            p => String(p.id) === String(currentPatientId)
          )
        : null;

    if (!patient) return;

    const btn = document.createElement('button');
    btn.id = 'deletePatientBtn';
    btn.type = 'button';
    btn.textContent = 'Eliminar';
    btn.setAttribute('aria-label', `Eliminar a ${patient.fullName || 'paciente'}`);
    btn.style.background = '#fff';
    btn.style.color = '#b42318';
    btn.style.border = '1px solid #fecaca';

    btn.onclick = () => deleteCurrentPatient(patient);
    heroActions.appendChild(btn);
  }

  function watchPatientDetail() {
    const detail = document.getElementById('patientDetail');
    if (!detail) return;

    new MutationObserver(() => {
      setTimeout(ensureDeletePatientButton, 0);
    }).observe(detail, {
      childList: true,
      subtree: true
    });

    ensureDeletePatientButton();
  }

  async function initPersistentSession() {
    wirePersistentButtons();
    watchPatientDetail();

    const ok = await getServerToken({ quiet: true });
    if (!ok) {
      markDisconnected(
        'Conecta Google una sola vez. Después la sesión se restaurará automáticamente.'
      );
      cleanConnectedBanner();
      showView('setupView');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => setTimeout(initPersistentSession, 0),
      { once: true }
    );
  } else {
    setTimeout(initPersistentSession, 0);
  }
})();
