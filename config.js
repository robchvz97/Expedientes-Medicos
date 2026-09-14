// Expedientes Médicos — configuración Google + sesión + borrado definitivo v4
// El Client ID es público por diseño. NO coloques aquí ningún Client Secret.
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

  async function getRawSheet(sheet) {
    const headers = SCHEMA[sheet];
    const end = columnName(headers.length);
    const range = `${sheet}!A:${end}`;
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(storage.spreadsheetId)}` +
      `/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
    const out = await apiJson(url);
    return { range, values: out.values || [] };
  }

  async function rewriteSheetWithoutPatient(sheet, patientId) {
    const { range, values } = await getRawSheet(sheet);
    const schemaHeaders = SCHEMA[sheet];

    if (!values.length) return;

    const headers = values[0]?.length ? values[0] : schemaHeaders;
    const idIndex = headers.indexOf('id');
    const patientIdIndex = headers.indexOf('patientId');

    const kept = [headers];

    for (const row of values.slice(1)) {
      const belongsToPatient =
        sheet === 'Patients'
          ? String(row[idIndex] ?? '') === String(patientId)
          : String(row[patientIdIndex] ?? '') === String(patientId);

      if (!belongsToPatient) kept.push(row);
    }

    const base =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(storage.spreadsheetId)}` +
      `/values/${encodeURIComponent(range)}`;

    await apiJson(`${base}:clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });

    await apiJson(`${base}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values: kept
      })
    });
  }

  async function deletePatientDriveData(patient) {
    const patientFiles = records.files.filter(
      f => String(f.patientId) === String(patient.id)
    );

    // Primero intenta eliminar cada archivo conocido.
    for (const file of patientFiles) {
      if (!file.driveFileId) continue;
      try {
        await apiFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.driveFileId)}`,
          { method: 'DELETE' }
        );
      } catch (err) {
        // Si el archivo ya no existe, seguimos.
        console.warn('No se pudo eliminar archivo individual:', err);
      }
    }

    // Después elimina la carpeta completa del paciente.
    if (patient.folderId) {
      try {
        await apiFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(patient.folderId)}`,
          { method: 'DELETE' }
        );
      } catch (err) {
        console.warn('No se pudo eliminar la carpeta del paciente:', err);
        throw new Error(
          'No se pudo eliminar por completo la carpeta del paciente en Google Drive. ' +
          'Vuelve a conectar Google e inténtalo otra vez.'
        );
      }
    }
  }

  async function deletePatientCompletely(patient) {
    const name = patient?.fullName || 'este paciente';

    const ok = confirm(
      `¿Eliminar DEFINITIVAMENTE a ${name}?\n\n` +
      `Se borrarán:\n` +
      `• Datos del paciente\n` +
      `• Todas sus consultas y progresos\n` +
      `• Todos sus pagos y abonos\n` +
      `• Imágenes y documentos de Google Drive\n` +
      `• Su carpeta de Google Drive\n\n` +
      `Esta acción NO se puede deshacer.`
    );
    if (!ok) return;

    const verification = prompt(
      `Para confirmar, escribe ELIMINAR:\n\n${name}`
    );
    if (String(verification || '').trim().toUpperCase() !== 'ELIMINAR') {
      alert('Eliminación cancelada.');
      return;
    }

    try {
      busy(true, 'Eliminando expediente completo…');

      // 1) Borra archivos y carpeta del paciente de Drive.
      await deletePatientDriveData(patient);

      // 2) Elimina físicamente TODAS las filas relacionadas en Sheets,
      //    incluyendo versiones antiguas del mismo registro.
      await rewriteSheetWithoutPatient('Files', patient.id);
      await rewriteSheetWithoutPatient('Visits', patient.id);
      await rewriteSheetWithoutPatient('Payments', patient.id);
      await rewriteSheetWithoutPatient('Patients', patient.id);

      currentPatientId = null;
      await refreshData();
      showView('patientsView');
      toast('Paciente y expediente eliminados');
    } catch (err) {
      friendlyError(err);
    } finally {
      busy(false);
    }
  }

  function installDeletePatientUI() {
    if (typeof renderPatientDetail !== 'function') return;

    const originalRenderPatientDetail = renderPatientDetail;

    renderPatientDetail = function(patient) {
      originalRenderPatientDetail(patient);

      const actions = document.querySelector('#patientDetail .hero-actions');
      if (!actions || document.getElementById('deletePatientComplete')) return;

      const btn = document.createElement('button');
      btn.id = 'deletePatientComplete';
      btn.type = 'button';
      btn.textContent = 'Eliminar paciente';
      btn.title = 'Eliminar definitivamente este expediente';
      btn.style.background = '#fee2e2';
      btn.style.color = '#b91c1c';
      btn.style.border = '1px solid #fecaca';
      btn.style.borderRadius = '10px';
      btn.style.padding = '9px 12px';
      btn.style.fontWeight = '700';
      btn.style.cursor = 'pointer';

      btn.onclick = () => deletePatientCompletely(patient);
      actions.appendChild(btn);
    };
  }

  window.addEventListener('load', () => {
    installDeletePatientUI();

    // Reemplaza los botones originales para reusar la sesión de Google cuando sea posible.
    ['connectGoogleBtn', 'setupConnectBtn', 'settingsConnect'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onclick = () =>
        smartConnectGoogle(localStorage.getItem(REMEMBER_KEY) !== '1', false);
    });

    // Reconexión automática al reabrir la app.
    if (localStorage.getItem(REMEMBER_KEY) === '1' && getClientId()) {
      setTimeout(() => smartConnectGoogle(false, true), 350);
    }
  });
})();
