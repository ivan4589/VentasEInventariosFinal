# Fase 1 — reparto móvil (backend + Prisma)

## Objetivo
Dos repartidores con cuentas VENDEDOR distintas registran entregas parciales de una misma preventa. No se crean almacenes por camión: Central incluye existencias físicas de camiones y almacén a efectos comerciales. La UI web actual no se modifica.

## Diseño y compatibilidad
- `Sale.deliveryMode` tiene valor inicial `false`: venta web tradicional sigue su flujo anterior.
- `Sale.deliveryRevision` es un contador optimista de cambios. Para registrar entregas o ajustar cantidades el celular envía el último valor recibido.
- `SaleDeliveryEvent` registra una operación con `idempotency-key` único, usuario, producto, tipo `DELIVER` o `RETURN` y cantidad positiva.
- Los eventos se vinculan a `Sale` + `Product` (no a `SaleDetail`) porque el flujo anterior de edición puede recrear detalles. Tras la primera entrega se bloquea esa edición tradicional y se usa el endpoint de ajuste de reparto.
- Crear una venta con `deliveryMode: true` evita la confirmación automática si ya está pagada; la confirmación se permite solo cuando todos los productos estén entregados.
- En una venta sin `deliveryMode`, las rutas y la confirmación anteriores se mantienen.
- La reserva de Central y la reserva del catálogo `Product` se ajustan en una única transacción. Una reducción de 10 a 6 libera 4 unidades reservadas inmediatamente, sin alterar el stock físico. Una ampliación verifica `stock - reservedStock` dentro de un UPDATE SQL condicional.
- Se usan los bloqueos por venta `pg_advisory_xact_lock(hashtext(saleId))` que ya utiliza SalesService. Una confirmación normal desde web no puede saltarse la verificación de entrega de una venta activada para reparto.
- Se bloquea la anulación de una preventa si todavía tiene unidades físicamente entregadas, hasta registrar la devolución.

## API (JWT de administrador o vendedor)
- `POST /api/sales` con `deliveryMode: true`: crea pedido destinado a reparto, sin autoconfirmación por pago.
- `POST /api/sales/:id/delivery/start`: habilita reparto para una preventa PENDING ya creada.
- `GET /api/sales/:id/delivery`: resumen y revisión actual, cantidades pedidas/entregadas/pendientes e historial.
- `POST /api/sales/:id/delivery/events` body: `{ "productId": "…", "kind": "DELIVER", "quantity": 2, "expectedRevision": 1 }`. Header obligatorio `Idempotency-Key: <uuid>`. Use `RETURN` para devolver unidades físicamente entregadas.
- `PATCH /api/sales/:id/delivery/quantity` body: `{ "productId": "…", "quantity": 6, "expectedRevision": 2 }`. `quantity: 0` retira el producto no entregado, salvo que sea la única línea.
- `PATCH /api/sales/:id/delivery/confirm`: confirma solo si todas las líneas están entregadas. Reutiliza PDF y movimiento de inventario originales.

Si devuelve HTTP 409, recargar `GET /delivery` y pedir al repartidor que revise cambios ajenos. Nunca reintentar como si fuera una entrega nueva sin comparar el estado. Para reintentar una solicitud cuyo resultado se desconoce, conservar la misma clave idempotente.

## Ejemplo: liberación/reventa
Central: stock físico 20, reservado 10 -> libre 10.
Cliente A reduce de 10 a 6 -> reservado 6 -> libre 14.
Cliente B puede reservar 4 adicionales inmediatamente, aunque el producto esté en cualquier camión o almacén, porque no se controlan ubicaciones.

Si el cliente A había recibido 3 unidades, se permite reducir hasta 3. Si las devolvió, registrar primero `RETURN 3` y después ajustar cantidad. El evento RETURN por sí solo no libera reservas: la reducción del pedido sí.

## Restricciones y pendientes para concluir el alcance
- **Bonificaciones:** por seguridad, el endpoint de ajuste rechaza pedidos con bonificaciones registradas; falta una transacción que recalcule derecho y asignaciones sin borrar el historial. Hasta entonces no habilitar esa operación en producción para dichos pedidos.
- **Precio automático:** para un producto existente conserva el precio unitario pactado; para un producto nuevo calcula precio vigente del tipo de cliente, considerando mayorista. Debe definirse si los cambios de cantidad recalculan también el precio de una línea ya existente.
- **Pagos:** una reducción inferior a los pagos existentes se rechaza; requiere regularización previa para evitar cobros inconsistentes.
- **Realtime:** esta fase solo guarda datos en PostgreSQL. Las suscripciones/seguridad de Supabase Realtime corresponden a fase 2.
- **Android:** aún no implementa estas rutas. Para pruebas usar cliente REST local. No desactivar permisos ni exponer claves de Supabase en el APK.
- **No incluye despliegue ni migración en producción.**

## Instalación en una base de DESARROLLO
1. Usar una base PostgreSQL de desarrollo aislada (no la URL de Supabase producción), con datos de prueba.
2. `npm ci` y configurar variables de entorno existentes según el proyecto.
3. `npx prisma validate`
4. `npx prisma migrate deploy`
5. `npx prisma generate`
6. `npm run build` y `npm test -- --runInBand delivery.service.spec.ts`
7. `npm run start:dev`

## Pruebas funcionales obligatorias antes de integrar el PR
1. Crear venta normal web: confirmar como antes, sin tocar entrega.
2. Crear venta móvil con `deliveryMode=true` y pago total: debe mantenerse PENDING.
3. Camión 1 entrega 3 de 5; camión 2 intenta entregar 3 con revisión antigua: rechazo 409. Tras actualizar solo entrega 2.
4. Confirmar con unidades pendientes: rechazo 400. Confirmar completa: una única salida de stock, un PDF.
5. Reducir de 10 a 6 antes de entregar: aparecen 4 unidades libres para otra preventa. Probar reserva simultánea desde dos usuarios.
6. Intentar disminuir por debajo de unidades entregadas: rechazo; devolver y reducir permite liberar reserva.
7. Probar bonificaciones: el ajuste debe rechazarse hasta resolver su regularización.
8. Intentar cancelar con unidades entregadas: rechazo.
9. Repetir el mismo evento y clave: no duplica entregas; repetir con datos diferentes: rechazo.
10. Verificar flujo web de contado, por cobrar, crédito, anulaciones y los comprobantes existentes.

## Estado de validación
El PR no se ha compilado ni ejecutado contra un PostgreSQL real desde este entorno; no fusionarlo con master ni migrarlo a producción antes de completar las pruebas y los pendientes indicados.
