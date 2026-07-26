import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { ReportsModule } from '../reports/reports.module';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [ReportsModule],
  controllers: [SalesController],
  providers: [SalesService, WhatsAppService],
})
export class SalesModule {}
