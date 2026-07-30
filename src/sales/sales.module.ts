import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportsModule } from '../reports/reports.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [ReportsModule, AuthModule],
  controllers: [SalesController],
  providers: [SalesService, WhatsAppService],
})
export class SalesModule {}
