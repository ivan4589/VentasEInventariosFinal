# Seguridad de autenticación — etapa 1: base de datos

## Alcance

Esta etapa prepara la base de datos para:

- registro público de usuarios;
- verificación de correo;
- aprobación o rechazo por un administrador;
- bloqueo por intentos fallidos;
- autenticación de dos factores TOTP;
- códigos de recuperación;
- recuperación de contraseña;
- sesiones con refresh token revocable;
- auditoría de seguridad.

## Regla de alcance de vendedores

Los vendedores atienden todos los pueblos y localidades. Por ese motivo, el modelo de seguridad **no relaciona usuarios con una localidad**. Las localidades continúan perteneciendo a los clientes y a la operación comercial, no al control de acceso del vendedor.

## Compatibilidad con usuarios existentes

La migración conserva las cuentas actuales:

- estado inicial `ACTIVE`;
- correo considerado verificado desde su fecha de creación;
- aprobación considerada realizada desde su fecha de creación;
- contraseña actual conservada en el campo `password`;
- rol actual conservado;
- 2FA desactivado hasta completar su incorporación gradual.

## Estados de usuario

- `PENDING_EMAIL_VERIFICATION`: cuenta creada, correo aún no confirmado.
- `PENDING_ADMIN_APPROVAL`: correo confirmado, esperando revisión.
- `ACTIVE`: acceso permitido.
- `REJECTED`: solicitud rechazada.
- `TEMPORARILY_LOCKED`: bloqueo temporal por seguridad.
- `DISABLED`: cuenta desactivada administrativamente.

## Tablas incorporadas

### security_tokens

Tokens de un solo uso para verificación de correo, recuperación de contraseña y desafíos 2FA. Solo se guardará el hash del token.

### auth_sessions

Sesiones revocables con hash del refresh token, IP, dispositivo, vencimiento y motivo de revocación.

### two_factor_methods

Secreto TOTP cifrado. Nunca debe almacenarse en texto plano.

### two_factor_recovery_codes

Códigos de emergencia almacenados únicamente como hash y utilizables una sola vez.

### login_attempts

Historial de accesos correctos y fallidos para bloqueo, investigación y auditoría.

### security_audit_logs

Registro inmutable de eventos de seguridad, incluyendo actor, usuario afectado, sesión, IP, dispositivo y detalles JSON.

## Reglas para la siguiente etapa

1. El registro público nunca aceptará el rol `ADMIN`.
2. `requestedRole` es solo una solicitud; el administrador asigna el rol definitivo.
3. Una cuenta nueva se crea como `PENDING_EMAIL_VERIFICATION`.
4. El login solo acepta usuarios `ACTIVE`.
5. Los tokens y códigos se almacenan hasheados.
6. El secreto TOTP se almacena cifrado con una clave externa definida en variables de entorno.
7. Un cambio de contraseña o reinicio de 2FA incrementará `securityVersion` y revocará las sesiones activas.
