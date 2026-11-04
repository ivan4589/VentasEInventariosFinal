# Fase 2 — Supabase Realtime para reparto móvil

## Estado
Código de backend + migración preparados en PR. **No se ha aplicado esta migración
a Supabase desde esta sesión; no se han probado conexiones WebSocket reales**.
El PR #46 (fase 1) ya está en master.

## Arquitectura
1. Los cambios de entregas y ajustes siguen pasando exclusivamente por NestJS.
   No se concede al APK escritura directa a tablas de ventas ni inventario.
2. Dos triggers de PostgreSQL, solo si existe el esquema `realtime`, emiten
   `realtime.send(..., private => true)` tras commits de `sales` con modo
   reparto y de `warehouse_stocks` con cambios físicos o de reserva.
3. Canales **privados**:
   - `yungas:delivery` evento `changed`: payload `{saleId, revision}`.
   - `yungas:inventory` evento `changed`: payload `{productId, warehouseId}`.
   NO se envían nombres, precios, teléfonos, JWT ni datos privados.
4. Los celulares usan `GET /api/realtime/access` con el JWT **normal de
   NestJS** para obtener un JWT **diferente** de solo cinco minutos que sirve
   únicamente para autenticarse en Supabase Realtime como rol
   `authenticated`. La política de `realtime.messages` solo autoriza
   **recibir** `broadcast`, no transmitir mensajes. Comprueba el ID, rol,
   estado, versión de seguridad y sesión (si existe) contra las tablas
   de usuarios propias del backend.
5. El APK usa el `SUPABASE_URL` público y una clave **publishable**, nunca
   un secret/service_role ni `SUPABASE_REALTIME_JWT_SECRET`.
6. Tras recibir `changed` el APK consulta `GET /api/sales/:id/delivery`
   o el endpoint de catálogo/inventario NestJS. Una notificación no actualiza
   stock ni autoriza una entrega por sí sola.
7. En conexión inicial, reconexión, regreso de segundo plano o expiración
   del token, renovar JWT y consultar nuevamente la fuente NestJS, ya que
   Broadcast **no garantiza** entrega de eventos cuando el dispositivo
   estuvo desconectado.

## Compatibilidad con firma JWT
La implementación inicial de `/api/realtime/access` firma HS256 usando
`SUPABASE_REALTIME_JWT_SECRET`, que debe ser el **JWT Secret heredado del
mismo proyecto Supabase** (solo variable de servidor). No es `JWT_SECRET`
de NestJS ni una API key.

**Verificar antes del despliegue** si tu proyecto Supabase todavía admite
validación con ese secreto HS256. Proyectos configurados exclusivamente con
nuevas signing keys necesitarán adaptar el emisor a la clave de firma
apropiada: **no habilitar Broadcast público** como alternativa. Si se
desconoce la configuración, dejar sin definir la variable; el endpoint
responderá 503 y las ventas existentes seguirán funcionando.

Los JWT de Supabase son utilizables potencialmente contra otros endpoints de
Supabase que acepten el rol `authenticated`. Auditar cuidadosamente todas las
políticas RLS del proyecto antes de activar el intercambio de JWT; no
conceder lectura/escritura general a ese rol. No exponer ninguna signing key.

## Aplicación de cambios en Supabase existente
- Confirmar que el PR #46 y su migración están aplicados.
- Hacer respaldo verificable de BD y registrar versión de migraciones.
- Revisar políticas existentes RLS para `authenticated`, sobre todo tablas
  de clientes, ventas, pagos y documentos. El nuevo token no puede heredar
  permisos excesivos a dichas tablas.
- Probar inicialmente en sesión controlada (preferible staging); la migración
  no modifica valores de existencias y la app web no necesita cambios.
- `npx prisma validate`
- `npx prisma migrate deploy`
- `npx prisma generate`
- `npm run build`
- `npm test -- --runInBand realtime-access.controller.spec.ts`
- Configurar `SUPABASE_REALTIME_JWT_SECRET` únicamente en variables seguras
  del backend Render, después de comprobar compatibilidad HS256.
- Verificar que la configuración del proyecto permite suscripciones
  privadas y que "Allow public access" está deshabilitado si procede.
- Hacer login con VENDEDOR, llamar `GET /api/realtime/access`, comprobar
  expiración y acceso denegado para COBRADOR.
- Con dos clientes de prueba, suscribirse a ambos canales con
  `private: true` y el token emitido. Modificar una preventa y verificar
  evento + recarga desde NestJS.
- Verificar que el token caduque y se renueve, que un usuario deshabilitado
  no consiga otro, y que no se puedan emitir eventos desde APK.

## Consultas SQL de diagnóstico (solo lectura)
```sql
SELECT tgname, tgrelid::regclass FROM pg_trigger
WHERE tgname IN ('yungas_sales_realtime', 'yungas_inventory_realtime');
SELECT policyname, schemaname, tablename, cmd FROM pg_policies
WHERE schemaname = 'realtime'
  AND policyname = 'yungas_delivery_inventory_listen';
```

## Precauciones
- Los triggers capturan errores de notificación sin abortar ventas reales; si
  fallan, revisar los logs PostgreSQL, ya que el repartidor necesitará
  refresco/reconexión para actualizar su pantalla.
- Los eventos pueden llegar duplicados y fuera de orden. Usar `revision`
  para descartar avisos antiguos; consultar el backend en la reconexión.
- Los canales son globales a ADMIN/VENDEDOR porque la fase 1 ya concede
  `sales.view.all` a ambos. Se emiten IDs, no datos comerciales.
- Se deberá comprobar el costo y límites de Realtime con la cantidad real
  de celulares concurrentes.
- Esta fase no instala el cliente Realtime en Kotlin; eso será fase 3.
- El token de intercambio debe renovarse periódicamente y al volver de
  segundo plano. La app debe manejar el error 503 con actualización manual.
- La migración solo crea triggers/política en Supabase; en PostgreSQL sin
  esquema `realtime` se omite sin error. No considerar eso una prueba.
- No ejecutar migraciones en producción sin respaldo/validación previa.
