# Operación segura en producción

Este documento es el contrato operativo del backend. Una publicación no se considera lista si falla cualquiera de los controles siguientes.

## Configuración y despliegue

1. Usar Node.js 22 y ejecutar `npm ci`, `npx prisma generate`, `npx prisma migrate deploy`, `npm run build` y `npm run start:prod`.
2. Definir `NODE_ENV=production`, URLs HTTPS y secretos diferentes de al menos 32 caracteres. El arranque se detiene si la configuración es insegura.
3. Mantener la base de datos en una red privada. El `docker-compose.yml` de desarrollo solo publica PostgreSQL en `127.0.0.1` y exige contraseña.
4. Terminar TLS en el proxy, configurar `TRUST_PROXY=true` y limitar `CORS_ORIGINS` a los dominios reales.
5. Montar `uploads/` y `BACKUP_DIR` en almacenamiento persistente. Los documentos sensibles continúan sirviéndose únicamente por endpoints autenticados.

## Errores, logs y monitoreo

- Todas las respuestas fallidas incluyen `requestId`, `timestamp` y `path`; los errores 500 no exponen detalles internos.
- El backend acepta o genera `X-Request-Id` y escribe un registro JSON por solicitud con estado y duración.
- `GET /api/health/live` comprueba el proceso. `GET /api/health/ready` comprueba también PostgreSQL.
- Enviar stdout/stderr al recolector de logs de la plataforma. No registrar tokens, cookies, contraseñas, cuerpos de solicitudes ni URLs con parámetros sensibles.
- Alertas mínimas: readiness fallido durante 2 minutos, tasa 5xx superior al 2 % durante 5 minutos, latencia p95 superior a 2 segundos, uso de disco superior al 80 % y ausencia de respaldo válido durante 26 horas.

## Respaldos y recuperación

Programar diariamente `npm run backup:db`. `BACKUP_DIR` debe ser un volumen cifrado, fuera del contenedor y replicado fuera de la región. El script genera archivos PostgreSQL en formato custom de forma atómica, con permisos restrictivos y retención configurable.

Después de cada copia, ejecutar:

```bash
npm run backup:verify -- /ruta/al/respaldo.dump
```

Cada mes se debe realizar una restauración completa en una base aislada:

```bash
createdb ventas_restore_test
pg_restore --clean --if-exists --no-owner --dbname ventas_restore_test /ruta/al/respaldo.dump
```

Validar conteos de usuarios, productos, ventas, pagos y movimientos de inventario; documentar RPO, RTO, fecha, responsable y resultado. Nunca probar una restauración sobre producción.

## Auditoría y pruebas previas

Ejecutar `npm run lint:production`, `npm run build`, `npm test -- --runInBand` y `npm audit --omit=dev --audit-level=high`. Las pruebas cubren la matriz fija de permisos, claves de idempotencia y orden estable de bloqueos concurrentes. El lint completo heredado se mantiene como deuda técnica separada para evitar mezclar cambios masivos de formato con la publicación. Cualquier excepción de seguridad debe quedar documentada, con responsable y fecha de corrección.

Antes de habilitar tráfico: aplicar migraciones, comprobar `live`/`ready`, ejecutar una operación de lectura por cada rol, probar una operación económica idempotente dos veces con la misma clave y confirmar que los logs correlacionan la solicitud sin datos sensibles.
