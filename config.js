// Expedientes Médicos v5.0
// Un solo flujo OAuth: Vercel server-side. Sin GIS ni manejadores duplicados.
(() => {
  if (!/\.vercel\.app$/i.test(location.hostname) && location.hostname !== 'localhost') return;

  let tokenRefreshTimer = null;

  function setLoginLinksVisible(visible) {
    document.querySelectorAll('.server-login-link').forEach(el => {
      el.style.display = visible ? '' : 'none';
    });
  }

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
      setLoginLinksVisible(false);
      showView('patientsView');

      clearTimeout(tokenRefreshTimer);
      const refreshMs = Math.max(60_000, (Number(data.expires_in || 3600) - 300) * 1000);
      tokenRefreshTimer = setTimeout(() => getServerToken({ quiet: true }), refreshMs);

      return true;
    } catch (err) {
      console.warn('No se pudo recuperar la sesión persistente:', err);
      return false;
    } finally {
      if (!quiet && typeof busy === 'function') busy(false);
    }
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
    setLoginLinksVisible(true);
    showView('setupView');
  }

  async function deleteCurrentPatient(patient) {
    const name = patient?.fullName || 'este paciente';

    const first = confirm(
      `¿Eliminar a ${name} de la aplicación?\n\n` +
      'Se quitará de la lista y de los totales. El historial quedará conservado como respaldo en Google Sheets/Drive.'
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
      await appendRecord('Patients', { ...patient, updatedAt: deletedAt, deletedAt });

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
    if (!heroActions || document.getElementById('deletePatientBtn')) return;

    const patient = records?.patients?.find(p => String(p.id) === String(currentPatientId));
    if (!patient) return;

    const btn = document.createElement('button');
    btn.id = 'deletePatientBtn';
    btn.type = 'button';
    btn.textContent = 'Eliminar';
    btn.style.background = '#fff';
    btn.style.color = '#b42318';
    btn.style.border = '1px solid #fecaca';
    btn.onclick = () => deleteCurrentPatient(patient);
    heroActions.appendChild(btn);
  }

  function watchPatientDetail() {
    const detail = document.getElementById('patientDetail');
    if (!detail) return;
    new MutationObserver(() => setTimeout(ensureDeletePatientButton, 0))
      .observe(detail, { childList: true, subtree: true });
  }

  function wireLogout() {
    const clear = document.getElementById('clearClientId');
    if (clear) {
      clear.textContent = 'Cerrar sesión';
      clear.onclick = logoutServer;
    }

    const save = document.getElementById('saveClientId');
    if (save) save.closest?.('.button-row')?.classList.add('hidden');
  }

  async function initPersistentSession() {
    wireLogout();
    watchPatientDetail();

    const ok = await getServerToken({ quiet: true });
    if (!ok) {
      markDisconnected('Conecta Google una sola vez. Después la sesión se restaurará automáticamente.');
      setLoginLinksVisible(true);
      showView('setupView');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPersistentSession, { once: true });
  } else {
    initPersistentSession();
  }
})();
