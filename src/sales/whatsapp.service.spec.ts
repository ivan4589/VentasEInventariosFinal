import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

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
    saleWhatsAppLog: {
      create: jest.fn(),
    },
  };
  const service = new WhatsAppService(
    prisma as unknown as PrismaService,
    configService,
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
    (readFile as jest.MockedFunction<typeof readFile>).mockResolvedValue(
      Buffer.from('%PDF-test'),
    );

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
