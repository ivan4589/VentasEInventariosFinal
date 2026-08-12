import { Module } from '@nestjs/common';
import { WhatsappWebhookService } from './whatsapp-webhook.service';
import { WhatsappController } from './whatsapp.controller';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappWebhookService],
})
export class WhatsappModule {}
