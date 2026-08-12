import {
  ForbiddenException,
  RawBodyRequest,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import type { Request } from 'express';
import { WhatsappWebhookService } from './whatsapp-webhook.service';
import { WhatsappController } from './whatsapp.controller';

describe('WhatsappController', () => {
  const values: Record<string, string> = {
    WHATSAPP_VERIFY_TOKEN: 'verify-token',
    WHATSAPP_APP_SECRET: 'meta-app-secret',
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  const webhookService = {
    process: jest.fn().mockResolvedValue(0),
  } as unknown as WhatsappWebhookService;
  const controller = new WhatsappController(config, webhookService);

  beforeEach(() => {
    jest.clearAllMocks();
    values.WHATSAPP_VERIFY_TOKEN = 'verify-token';
    values.WHATSAPP_APP_SECRET = 'meta-app-secret';
  });

  it('responde al desafío de verificación con el token correcto', () => {
    expect(
      controller.verifyWebhook('subscribe', 'verify-token', 'challenge-1'),
    ).toBe('challenge-1');
  });

  it('no acepta la verificación cuando el token no está configurado', () => {
    values.WHATSAPP_VERIFY_TOKEN = '';

    expect(() =>
      controller.verifyWebhook('subscribe', '', 'challenge-1'),
    ).toThrow(ServiceUnavailableException);
  });

  it('rechaza webhooks sin una firma válida de Meta', async () => {
    const request = {
      rawBody: Buffer.from('{"entry":[]}'),
    } as RawBodyRequest<Request>;

    await expect(
      controller.receiveWebhook(request, 'sha256=incorrecta', {}),
    ).rejects.toThrow(ForbiddenException);
  });

  it('acepta un webhook firmado y procesa sus estados', async () => {
    const rawBody = Buffer.from('{"entry":[]}');
    const signature = `sha256=${createHmac('sha256', values.WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest('hex')}`;
    const request = { rawBody } as RawBodyRequest<Request>;

    const payload = { entry: [] };

    await expect(
      controller.receiveWebhook(request, signature, payload),
    ).resolves.toEqual({ received: true });
    expect(webhookService.process).toHaveBeenCalledWith(payload);
  });
});
