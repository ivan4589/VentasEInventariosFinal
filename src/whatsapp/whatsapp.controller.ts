import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';

@Controller('whatsapp')
export class WhatsappController {
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }

    throw new ForbiddenException('Token de verificación incorrecto');
  }

  @Post('webhook')
  @HttpCode(200)
  receiveWebhook(@Body() payload: unknown) {
    console.log('Webhook recibido:', JSON.stringify(payload, null, 2));

    return {
      received: true,
    };
  }
}