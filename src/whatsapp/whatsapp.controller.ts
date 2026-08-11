import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly config: ConfigService) {}

  private sameSecret(received: string, expected: string): boolean {
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);

    return (
      receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer)
    );
  }

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const verifyToken = this.config
      .get<string>('WHATSAPP_VERIFY_TOKEN')
      ?.trim();

    if (!verifyToken) {
      throw new ServiceUnavailableException(
        'El webhook de WhatsApp no está configurado',
      );
    }

    if (
      mode === 'subscribe' &&
      typeof token === 'string' &&
      this.sameSecret(token, verifyToken)
    ) {
      return challenge;
    }

    throw new ForbiddenException('Token de verificación incorrecto');
  }

  @Post('webhook')
  @HttpCode(200)
  receiveWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() _payload: unknown,
  ) {
    const appSecret = this.config.get<string>('WHATSAPP_APP_SECRET')?.trim();

    if (!appSecret) {
      throw new ServiceUnavailableException(
        'La firma del webhook de WhatsApp no está configurada',
      );
    }

    if (!request.rawBody || !signature?.startsWith('sha256=')) {
      throw new ForbiddenException('Firma de webhook ausente o inválida');
    }

    const expectedSignature = `sha256=${createHmac('sha256', appSecret)
      .update(request.rawBody)
      .digest('hex')}`;

    if (!this.sameSecret(signature, expectedSignature)) {
      throw new ForbiddenException('Firma de webhook incorrecta');
    }

    return {
      received: true,
    };
  }
}
