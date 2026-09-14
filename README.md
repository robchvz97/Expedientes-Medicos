# Expedientes Médicos · PWA v1

Prototipo local instalable para gestionar pacientes, consultas, adjuntos y pagos.

## Importante
Esta versión guarda información en IndexedDB del navegador. Es adecuada para pruebas y diseño, NO para expedientes clínicos reales sin agregar autenticación, cifrado, respaldo remoto, control de accesos y políticas de privacidad.

## Funciones
- Pacientes ilimitados en la práctica (IndexedDB; probado para listas grandes, la capacidad real depende del dispositivo).
- Nombre, fecha de nacimiento, teléfono, diagnóstico y notas.
- Historial de consultas/progreso.
- Archivos e imágenes por paciente.
- Total acordado, abonos y saldo.
- Búsqueda y filtros.
- Resumen financiero.
- Impresión/PDF del expediente desde el navegador.
- Respaldo JSON de datos (sin adjuntos).
- PWA instalable y funcionamiento offline después de la primera carga.

## Próxima fase recomendada para uso real
- Inicio de sesión.
- Base de datos en servidor.
- Cifrado en tránsito y en reposo.
- Copias de seguridad automáticas.
- Roles y bitácora de accesos.
- Política de privacidad / consentimiento / cumplimiento aplicable.
