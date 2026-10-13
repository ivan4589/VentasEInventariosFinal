import { ConflictException } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

describe('envío del mismo PDF sin cambiar plantilla ni venta', () => {
  const sale = { id: 'sale', saleNumber: 'TEST-GROUP', status: 'CONFIRMED', total: 545,
    client: { fullName: 'Cliente de prueba', phone: '71234567', whatsappConsent: true },
    whatsappLogs: [], pdfUrl: '/uploads/sales/venta-TEST-GROUP.pdf',
  };
  const response = (data: object) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  let prisma: any;
  let storage: any;
  let service: WhatsAppService;
  let template: string;
  beforeEach(() => {
    template = 'nota_ventas_pdf';
    prisma = { sale: { findUnique: jest.fn().mockResolvedValue(sale), update: jest.fn() }, saleWhatsAppLog: { create: jest.fn().mockResolvedValue({ createdAt: new Date() }) } };
    storage = { readPrivate: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')) };
    const config = { get: (key: string) => ({ WHATSAPP_TEMPLATE_NAME: template, WHATSAPP_TEMPLATE_LANGUAGE: 'es', WHATSAPP_ACCESS_TOKEN: 'test-token', WHATSAPP_PHONE_NUMBER_ID: '12345', WHATSAPP_GRAPH_API_VERSION: 'v25.0', WHATSAPP_DEFAULT_COUNTRY_CODE: '591' })[key] };
    service = new WhatsAppService(prisma, config as any, storage);
  });
  afterEach(() => jest.restoreAllMocks());
  it.each(['nota_ventas_pdf', 'nota_venta_pdf'])('reutiliza exactamente el nombre configurado %s y el encabezado PDF', async name => {
    template = name;
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({ id: 'media-test' })).mockResolvedValueOnce(response({ messages: [{ id: 'message-test' }] }));
    await service.sendSaleDocument('sale', 1);
    const upload = fetch.mock.calls[0][1]!.body as FormData;
    expect((upload.get('file') as Blob).type).toBe('application/pdf');
    const payload = JSON.parse(fetch.mock.calls[1][1]!.body as string);
    expect(payload.template.name).toBe(name);
    expect(payload.template.language.code).toBe('es');
    expect(payload.template.components[0].type).toBe('header');
    expect(payload.template.components[0].parameters[0].document.filename).toMatch(/\.pdf$/);
    expect(storage.readPrivate).toHaveBeenCalledWith(sale.pdfUrl);
    expect(prisma.sale.update).not.toHaveBeenCalled();
  });
  it('rechaza un segundo toque concurrente en la misma instancia sin subir o enviar dos veces', async () => {
    let release!: (value: Buffer) => void;
    storage.readPrivate.mockReturnValue(new Promise<Buffer>(resolve => { release = resolve; }));
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({ id: 'media-test' })).mockResolvedValueOnce(response({ messages: [{ id: 'message-test' }] }));
    const first = service.sendSaleDocument('sale', 1);
    await expect(service.sendSaleDocument('sale', 1)).rejects.toBeInstanceOf(ConflictException);
    release(Buffer.from('%PDF-test'));
    await first;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(prisma.saleWhatsAppLog.create).toHaveBeenCalledTimes(1);
  });
  it('un fallo no modifica la venta y libera el bloqueo para permitir reintento', async () => {
    const original = JSON.stringify(sale);
    const fetch = jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('fallo de prueba'));
    await expect(service.sendSaleDocument('sale', 1)).rejects.toThrow();
    expect(prisma.sale.update).not.toHaveBeenCalled();
    expect(JSON.stringify(sale)).toBe(original);
    fetch.mockResolvedValueOnce(response({ id: 'media-test' })).mockResolvedValueOnce(response({ messages: [{ id: 'message-test' }] }));
    await expect(service.sendSaleDocument('sale', 1)).resolves.toMatchObject({ status: 'SENT' });
  });
});
