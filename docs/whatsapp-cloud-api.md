# Envío automático de notas de venta por WhatsApp

El frontend nunca recibe el token de Meta. El botón de WhatsApp llama al
backend, y NestJS valida la venta, sube el PDF a Meta y envía una plantilla
aprobada.

## 1. Requisitos en Meta

1. Crea una aplicación de tipo **Business** en Meta for Developers.
2. Agrega el producto **WhatsApp**.
3. Vincula el número empresarial que enviará las notas.
4. Crea una plantilla de categoría **Utility** con estos datos:

   - Nombre: `nota_venta_pdf`
   - Idioma: Spanish (`es`)
   - Encabezado: documento
   - Cuerpo:

     ```text
     Hola {{1}}, adjuntamos la nota de venta N.º {{2}} por Bs {{3}}.
     Gracias por su compra.
     ```

5. Espera a que la plantilla tenga estado **Approved**.
6. Genera un token permanente con permiso
   `whatsapp_business_messaging`.

El orden de las tres variables debe coincidir exactamente con la plantilla:
nombre del cliente, número de venta y total.

## 2. Variables del backend

Agrega únicamente en el archivo `.env` del backend:

```env
WHATSAPP_ACCESS_TOKEN="token-permanente-de-meta"
WHATSAPP_PHONE_NUMBER_ID="identificador-del-numero"
WHATSAPP_GRAPH_API_VERSION="v25.0"
WHATSAPP_TEMPLATE_NAME="nota_venta_pdf"
WHATSAPP_TEMPLATE_LANGUAGE="es"
WHATSAPP_DEFAULT_COUNTRY_CODE="591"
WHATSAPP_REQUEST_TIMEOUT_MS="15000"
WHATSAPP_VERIFY_TOKEN="valor-privado-generado-por-el-equipo"
WHATSAPP_APP_SECRET="secreto-de-la-aplicacion-meta"
```

No uses el App ID, el WhatsApp Business Account ID ni el número telefónico en
`WHATSAPP_PHONE_NUMBER_ID`; ese valor es el **Phone number ID** mostrado en la
configuración de la API.

No agregues estas variables al frontend ni publiques el `.env`.

El token de verificación y el secreto de la aplicación se usan para validar
los webhooks de Meta. El backend rechaza webhooks sin firma válida y no
registra el contenido completo del evento para evitar exponer datos de los
clientes en los logs.

## 3. Migración

Después de integrar la rama:

```bash
npm install
npx prisma migrate dev
npx prisma generate
npm run start:dev
```

Si Prisma propone reiniciar la base de datos, responde que no y revisa el
historial de migraciones antes de continuar.

## 4. Preparación del cliente

En el módulo Clientes:

1. Registra un teléfono boliviano de ocho dígitos o con prefijo `591`.
2. Obtén autorización del cliente.
3. Marca **Autoriza el envío de documentos por WhatsApp**.

La autorización comienza desmarcada para todos los clientes actuales.

## 5. Envío

1. Confirma la venta.
2. Comprueba que el PDF se haya generado.
3. Pulsa el icono verde de WhatsApp.
4. Si la venta ya fue enviada, la interfaz solicitará confirmación antes de
   reenviar.

Cada intento queda registrado con la venta, el usuario, el número normalizado,
el identificador de Meta y su estado: enviado, entregado, leído o fallido.
Los webhooks firmados actualizan el estado sin guardar el contenido del mensaje.

## 6. Diagnóstico

- **WhatsApp no está configurado:** falta el token o el Phone number ID.
- **Plantilla no encontrada o idioma incorrecto:** verifica el nombre, idioma
  y estado Approved en Meta.
- **El cliente no autorizó:** edita el cliente y registra su consentimiento.
- **No se encontró el PDF:** vuelve a confirmar/generar el comprobante en el
  servidor que ejecuta el backend.
- **Token vencido:** reemplázalo por un token permanente válido.
