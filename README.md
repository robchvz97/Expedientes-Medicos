# Expedientes Médicos · GitHub + Google Drive

Aplicación web instalable (PWA) para expedientes de pacientes.

## Dónde se guarda cada cosa
- **GitHub Pages:** únicamente el código de la app.
- **Google Sheets:** pacientes, diagnósticos, consultas, progresos y pagos.
- **Google Drive:** imágenes, PDFs y demás archivos del paciente.
- La app **no guarda expedientes clínicos en GitHub**.

## Configuración de Google (una sola vez)

La app usa Google Identity Services directamente desde el navegador. No utiliza Client Secret.

1. Entra a Google Cloud Console con la cuenta que administrará la app.
2. Crea un proyecto, por ejemplo `Expedientes Médicos`.
3. Habilita estas APIs:
   - Google Drive API
   - Google Sheets API
4. Configura la pantalla de consentimiento OAuth. Si el proyecto está en modo prueba, agrega la cuenta de Google del doctor como usuario de prueba.
5. Ve a **APIs y servicios > Credenciales > Crear credenciales > ID de cliente OAuth**.
6. Tipo: **Aplicación web**.
7. En **Orígenes autorizados de JavaScript** agrega exactamente:
   `https://robchvz97.github.io`
8. Crea la credencial y copia el `Client ID` que termina en `.apps.googleusercontent.com`.
9. Abre la app en GitHub Pages > **Ajustes** > pega ese Client ID > **Guardar**.
10. Toca **Conectar con Google** y acepta el permiso solicitado.

La app solicita únicamente `https://www.googleapis.com/auth/drive.file`, que permite trabajar con archivos creados o usados por esta app, en lugar de pedir acceso general a todo Google Drive.

## Publicar en GitHub
Sube todos los archivos de esta carpeta a la raíz del repositorio `Expedientes-Medicos` y activa GitHub Pages desde `main` / `(root)`.

URL esperada:
`https://robchvz97.github.io/Expedientes-Medicos/`

## Primer uso
Al conectar Google por primera vez, la app crea automáticamente:
- `Expedientes Médicos - Datos` (Google Sheets)
- `Expedientes Médicos - Archivos` (carpeta de Google Drive)

Cada paciente recibe su propia subcarpeta para documentos.

## Nota de seguridad
Los expedientes médicos contienen datos personales sensibles. Antes de uso clínico real conviene revisar el aviso de privacidad, controles de acceso de la cuenta de Google, MFA/2FA, políticas de respaldo y obligaciones legales aplicables. No compartas públicamente la hoja ni las carpetas de Drive.
