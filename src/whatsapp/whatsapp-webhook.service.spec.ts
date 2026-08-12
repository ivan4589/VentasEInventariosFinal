import { WhatsAppSendStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappWebhookService } from './whatsapp-webhook.service';

describe('WhatsappWebhookService', () => {
  const prisma = {
    saleWhatsAppLog: {
      updateMany: jest.fn(),
    },
  };
  const service = new WhatsappWebhookService(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.saleWhatsAppLog.updateMany.mockResolvedValue({ count: 1 });
  });

  it('actualiza el mensaje cuando Meta confirma la entrega', async () => {
    await expect(
      service.process({
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [{ id: 'wamid.1', status: 'delivered' }],
                },
              },
            ],
          },
        ],
      }),
    ).resolves.toBe(1);

    expect(prisma.saleWhatsAppLog.updateMany).toHaveBeenCalledWith({
      where: {
        metaMessageId: 'wamid.1',
        status: {
          in: [WhatsAppSendStatus.SENT, WhatsAppSendStatus.DELIVERED],
        },
      },
      data: {
        status: WhatsAppSendStatus.DELIVERED,
        errorMessage: null,
      },
    });
  });

  it('registra el detalle seguro de un fallo reportado por Meta', async () => {
    await service.process({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid.2',
                    status: 'failed',
                    errors: [
                      {
                        code: 131026,
                        title: 'Message undeliverable',
                        error_data: { details: 'Recipient unavailable' },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(prisma.saleWhatsAppLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: WhatsAppSendStatus.FAILED,
          errorMessage:
            'Meta 131026: Message undeliverable: Recipient unavailable',
        },
      }),
    );
  });

  it('ignora eventos que no contienen estados de entrega', async () => {
    await expect(service.process({ entry: [] })).resolves.toBe(0);
    expect(prisma.saleWhatsAppLog.updateMany).not.toHaveBeenCalled();
  });
});
