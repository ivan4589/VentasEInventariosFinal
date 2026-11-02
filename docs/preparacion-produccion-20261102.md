# Preparación para producción — 2026-11-02

## Alcance

Revisión y correcciones locales. No desplegar, ejecutar migraciones en producción, enviar WhatsApp ni modificar datos reales como parte de esta preparación.

## Estado inicial confirmado

- Backend origin/master: 011aea7 (PR 44, contactos de WhatsApp).
- Frontend origin/master: 9068a5f (PR 35, selector de destinatarios).
- Las ramas locales de funcionalidad contenían el mismo código pero aún no sus commits de fusión.
- Producción responde HTTP 200 en /api/health/live, /api/health/ready y /login. Readiness confirma database up.
- GitHub registra producción del frontend en 9068a5f desde el 27 de octubre. No se verificó el commit del contenedor de Render en esta revisión.
- PDFs locales del usuario conservados, excluidos de cualquier cambio de código.

## Correcciones preparadas

- Migración aditiva 20261102090000_secure_client_contacts: RLS y revocación de permisos PUBLIC, anon y authenticated; mantiene acceso del propietario y datos existentes.
- El consentimiento de WhatsApp no se hereda al cambiar el número del contacto sin confirmación explícita. Cambiar solo el formato no lo revoca.
- Pruebas de consentimiento y migración, y reparación del mock de historial del PDF de WhatsApp.
- Fixtures de administración adaptados a confirmación reforzada, contraseña temporal y revocación de sesiones; fixtures de reportes con bonificaciones; pruebas de construcción con dependencias simuladas.
- Actualización compatible de dependencias sin npm audit fix --force. Validación final pendiente al escribir este documento.

## Resultados iniciales, antes de actualizar dependencias

- Backend build: aprobado.
- Frontend build: aprobado; advertencia de bundle grande (~1390 kB).
- Frontend: 31 pruebas aprobadas en 7 archivos.
- Backend completo: 191 aprobadas y 28 fallidas en 59 suites; fallos de fixtures/dependencias de pruebas identificados y corregidos localmente después de esta ejecución.
- Contactos, consentimiento, RLS y WhatsApp: 23 pruebas específicas aprobadas en 5 suites antes de la actualización de dependencias.
- Auditorías iniciales: backend producción 7 altas y 8 moderadas; frontend completa 3 altas y 12 moderadas. No representan el estado después de actualizar.

## Secuencia de publicación posterior

1. Terminar instalación, auditorías, generación de Prisma, compilación y pruebas con lockfiles finales.
2. Revisar los diffs y publicar los PR solo con autorización, considerando que un push del frontend puede activar una preview y fusionar master activa Vercel.
3. Obtener autorización para desplegar y verificar un respaldo nuevo, privado y recuperable antes de cambiar la base de datos.
4. Consultar el estado real de migraciones en Supabase sin usar migrate dev, reset ni db push en producción.
5. Aplicar las migraciones pendientes, incluida la protección de contactos, y verificar RLS y ausencia de grants públicos.
6. Desplegar backend exacto, comprobar live/ready y logs; después frontend exacto y dominio principal.
7. Pruebas autenticadas con datos y números autorizados, sin crear ventas ni envíos reales sin acuerdo previo.

No declarar finalizada la preparación mientras existan validaciones pendientes o fallidas. Documentar riesgos residuales de dependencias sin forzar cambios incompatibles para silenciar auditorías.

## Validación posterior a las correcciones

- Prisma, cliente y adaptador alineados en 7.10.1; cliente regenerado.
- Multer 2.5.0 resuelto también para Nest mediante override de la dependencia directa.
- Frontend: 31/31 pruebas, build y lint:production aprobados con dependencias actualizadas; bundle 1384.26 kB, advertencia de tamaño conservada.
- Auditoría frontend: 0 alertas en dependencias de producción; 12 moderadas en herramientas de desarrollo, sin altas.
- Auditoría backend de producción tras corregir la cadena Excel/ZIP: 0 vulnerabilidades, incluyendo moderadas; salida 0 con el umbral original del CI.
- Las migraciones de contactos y RLS se aplicaron correctamente a PostgreSQL AISLADO en 127.0.0.1:54329/grouping_dev (37 migraciones totales). Identidad del directorio de datos comprobada antes de ejecutar.
- Prueba real de permisos: propietario puede leer; anon y authenticated reciben permiso denegado. Grants y roles temporales revertidos. Servidor local de prueba detenido; datos de prueba conservados.
- Backend final: 226/226 pruebas aprobadas en 61 suites, sin fallos. Compilación y lint:production posteriores a la actualización aprobados, salida 0. Los mensajes de readiness offline y Resend sin configurar provienen de pruebas simuladas; no describen producción.

## Corrección del bloqueo de auditoría de Excel

El workflow backend auth-validation.yml mantiene npm audit --omit=dev --audit-level=moderate. La auditoría ahora pasa sin alertas. NO se aplicó --force, se degradó ExcelJS ni se redujo el umbral del CI.

El usuario autorizó corregir las 8 alertas y publicar los PR. Todas procedían de minimatch antiguo en la cadena de ExcelJS. Se comprobó que actualizar solo el matcher rompe glob 7; esa solución se descartó mediante pruebas reales antes de publicar.

La solución usa glob 14.0.2 y minimatch 11.0.1 para readdir-glob. Un adaptador propio y limitado conserva callback, sync y hasMagic para los tres consumidores legados auditados. No implementa el matcher: delega al glob oficial corregido. El postinstall valida versiones y rutas, cambia exclusivamente los imports conocidos y es idempotente; falla si cambia una dependencia inesperadamente.

La instalación local empaquetada se configura con install-links=true. Docker incluye el paquete y el script antes de npm ci y conserva las migraciones. Se añadió un job de CI que construye la imagen de producción y verifica Excel, imports y migración sin base de datos ni credenciales.

Pruebas específicas después de la adaptación: 20 aprobadas en 3 suites, incluyendo importación/exportación de clientes y productos, ZIP real, escritura XLSX en streaming, API callback/sync de rimraf con borrado simulado e idempotencia del instalador. No se suprimió ninguna alerta ni se aprobó excepción de seguridad.

Ramas de trabajo: fix/production-readiness-20261102 en ambos repositorios. Frontend publicado en PR https://github.com/ivan4589/frontendProyectoFinal/pull/36 con controles aprobados. Backend pendiente de publicar al actualizar este documento. No se modificó master ni se alteró producción. La preview de Vercel es una validación del PR, no una publicación de producción.

Resultado actual: auditoría de producción sin alertas y compatibilidad específica verificada; nueva ejecución completa del backend en curso. La validación de la imagen se ejecutará en el CI del PR. No se han probado flujos autenticados ni enviado mensajes en producción.
