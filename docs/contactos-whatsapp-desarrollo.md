# Contactos de WhatsApp para notas de venta

Esta migración agrega contactos sin modificar los teléfonos ni autorizaciones existentes. La aplicación actual puede seguir llamando `POST /sales/:id/whatsapp` con `{ "resend": false }`.

## Probar en desarrollo

Usar una base de datos de desarrollo separada de producción y revisar `DATABASE_URL` y `DIRECT_URL` antes de continuar. No ejecutar con datos productivos. Hacer respaldo de cualquier base con datos que se quieran conservar. En Node 22:

```bash
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
npm test -- --runInBand
npm run start:dev
```

No aceptar un reinicio de base de datos. La migración se aplica sobre la base configurada; no cambia Supabase por sí sola. No enviar mensajes a clientes reales durante las pruebas. El frontend existente aún no ofrece las nuevas pantallas; se pueden probar los endpoints con una sesión autorizada y números de prueba con consentimiento.

## API

- `GET /clients/:id/contacts`: lista contactos activos e inactivos; ADMIN, VENDEDOR y COBRADOR con permiso de lectura de clientes.
- `POST /clients/:id/contacts`: ADMIN con permiso de modificación; ejemplo: `{ "name":"Juan", "relationship":"Encargado", "phone":"71234567", "whatsappConsent":true, "isDefault":true }`. La autorización es individual y por defecto es falsa.
- `PATCH /clients/:id/contacts/:contactId`: ADMIN; actualizar campos o desactivar con `{ "isActive":false }`. No elimina el historial.
- `POST /sales/:id/whatsapp/recipients`: ADMIN o VENDEDOR con permiso y acceso a la venta; ejemplo `{ "recipients":["principal", "id-del-contacto"], "resend":false }`. Se devuelve un resultado por destinatario; revisar cada resultado aunque la respuesta HTTP sea exitosa. `principal` usa el número y autorización originales. Solo se aceptan contactos activos pertenecientes al cliente de la venta.
- `GET /sales/:id/whatsapp/logs`: historial por número para usuarios autorizados; los webhooks existentes actualizan los estados. `SENT` indica aceptación por Meta, no entrega.

Los duplicados se verifican por venta y teléfono normalizado; para reenviar se debe pasar `resend:true`. Se recomienda seleccionar únicamente los destinatarios que se desea reenviar. El proceso usa un bloqueo en memoria existente: no garantiza exclusión entre varias instancias ni evita duplicados ante un timeout o fallo después de que Meta acepte el mensaje. Verificar historial y Meta antes de reintentar. No hay cola ni reintento automático.

La plantilla continúa usando el nombre, número de venta y **total**, no el saldo actual. No se modificó el PDF ni se confirmó que refleje pagos parciales. Antes de usarlo para cobranza, verificar manualmente el saldo. `isDefault` es solo una preferencia para el futuro selector de la web o móvil; no activa envíos automáticos. No hay número temporal sin registrar. El cambio no modifica plantilla ni configuración de Meta. Validar su nombre e idioma reales en el entorno de pruebas.
