import {
  ForbiddenException,
  RawBodyRequest,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import type { Request } from 'express';
import { WhatsappController } from './whatsapp.controller';

describe('WhatsappController', () => {
  const values: Record<string, string> = {
    WHATSAPP_VERIFY_TOKEN: 'verify-token',
    WHATSAPP_APP_SECRET: 'meta-app-secret',
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  const controller = new WhatsappController(config);

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

  it('rechaza webhooks sin una firma válida de Meta', () => {
    const request = {
      rawBody: Buffer.from('{"entry":[]}'),
    } as RawBodyRequest<Request>;

    expect(() =>
      controller.receiveWebhook(request, 'sha256=incorrecta', {}),
    ).toThrow(ForbiddenException);
  });

  it('acepta un webhook firmado sin registrar el contenido sensible', () => {
    const rawBody = Buffer.from('{"entry":[]}');
    const signature = `sha256=${createHmac('sha256', values.WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest('hex')}`;
    const request = { rawBody } as RawBodyRequest<Request>;

    expect(controller.receiveWebhook(request, signature, {})).toEqual({
      received: true,
    });
  });
});
