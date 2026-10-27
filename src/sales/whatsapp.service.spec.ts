import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';

describe('WhatsAppService', () => {
  const configValues: Record<string, string> = {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: '123456',
    WHATSAPP_GRAPH_API_VERSION: 'v25.0',
    WHATSAPP_TEMPLATE_NAME: 'nota_venta_pdf',
    WHATSAPP_TEMPLATE_LANGUAGE: 'es',
    WHATSAPP_DEFAULT_COUNTRY_CODE: '591',
  };
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const prisma = {
    sale: {
      findUnique: jest.fn(),
    },
    clientContact: { findFirst: jest.fn() },
    saleWhatsAppLog: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  const storage = {
    readPrivate: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  };
  const service = new WhatsAppService(
    prisma as unknown as PrismaService,
    configService,
    storage as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normaliza números bolivianos locales e internacionales', () => {
    expect(service.normalizePhone('71234567')).toBe('59171234567');
    expect(service.normalizePhone('+591 7123-4567')).toBe('59171234567');
  });

  it('rechaza teléfonos con formato inválido', () => {
    expect(() => service.normalizePhone('123')).toThrow(BadRequestException);
  });

  it('exige una venta confirmada', async () => {
    prisma.sale.findUnique.mockResolvedValue({
      id: 'sale-1',
      status: 'PENDING',
      client: {
        phone: '71234567',
        whatsappConsent: true,
      },
      whatsappLogs: [],
      pdfUrl: '/uploads/sales/venta.pdf',
    });

    await expect(service.sendSaleDocument('sale-1', 1)).rejects.toThrow(
      'Solo se puede enviar una venta confirmada',
    );
  });

  it('rechaza contactos de otro cliente o inactivos', async () => {
    prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', clientId: 'client-1', status: 'CONFIRMED', client: {}, whatsappLogs: [], pdfUrl: 'pdf' });
    prisma.clientContact.findFirst.mockResolvedValue(null);
    await expect(service.sendSaleDocument('sale-1', 1, false, 'contact-1')).rejects.toThrow('Contacto activo no encontrado');
    expect(prisma.clientContact.findFirst).toHaveBeenCalledWith({ where: { id: 'contact-1', clientId: 'client-1', isActive: true } });
  });

  it('rechaza un contacto sin consentimiento', async () => {
    prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', clientId: 'client-1', status: 'CONFIRMED', client: {}, whatsappLogs: [], pdfUrl: 'pdf' });
    prisma.clientContact.findFirst.mockResolvedValue({ phone: '71234567', whatsappConsent: false });
    await expect(service.sendSaleDocument('sale-1', 1, false, 'contact-1')).rejects.toThrow('no autorizó');
  });

  it('evita reenviar al mismo número sin autorización explícita', async () => {
    prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'CONFIRMED', client: { phone: '71234567', whatsappConsent: true }, whatsappLogs: [], pdfUrl: 'pdf' });
    prisma.saleWhatsAppLog.findFirst.mockResolvedValueOnce({ id: 'previous' });
    await expect(service.sendSaleDocument('sale-1', 1)).rejects.toThrow('ya fue enviada');
    expect(prisma.saleWhatsAppLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ saleId: 'sale-1', phoneNumber: '59171234567' }) }));
  });

  it('sube el PDF y envía la plantilla aprobada', async () => {
    const sentAt = new Date('2026-07-25T19:00:00.000Z');
    prisma.sale.findUnique.mockResolvedValue({
      id: 'sale-1',
      saleNumber: '20260725-001',
      status: 'CONFIRMED',
      total: 150.5,
      client: {
        fullName: 'Tienda Don Mario',
        phone: '71234567',
        whatsappConsent: true,
      },
      whatsappLogs: [],
      pdfUrl: '/uploads/sales/venta-20260725-001.pdf',
    });
    prisma.saleWhatsAppLog.create.mockResolvedValue({
      createdAt: sentAt,
    });
    storage.readPrivate.mockResolvedValue(Buffer.from('%PDF-test'));

    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'media-1',
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messages: [
              {
                id: 'wamid.1',
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

    const result = await service.sendSaleDocument('sale-1', 7);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      saleId: 'sale-1',
      status: 'SENT',
      phoneNumber: '59171234567',
      messageId: 'wamid.1',
      sentAt,
    });
    expect(prisma.saleWhatsAppLog.create).toHaveBeenCalledWith({
      // Jest representa los matchers asimétricos como `any`.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        saleId: 'sale-1',
        userId: 7,
        phoneNumber: '59171234567',
        status: 'SENT',
        metaMessageId: 'wamid.1',
      }),
    });

    fetchMock.mockRestore();
  });
});
