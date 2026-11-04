import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeAccessController } from './realtime-access.controller';
import { AuthModule } from '../auth/auth.module';
import { ReportsModule } from '../reports/reports.module';
import { BonusReportService } from './bonuses/bonus-report.service';
import { BonusReportController } from './bonuses/bonus-report.controller';
import { BonusRulesService } from './bonuses/bonus-rules.service';
import { BonusRulesController } from './bonuses/bonus-rules.controller';
import { SalesController } from './sales.controller';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { SalesService } from './sales.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [ReportsModule, AuthModule, JwtModule.register({})],
  controllers: [SalesController, DeliveryController, RealtimeAccessController, BonusRulesController, BonusReportController],
  providers: [SalesService, DeliveryService, WhatsAppService, BonusRulesService, BonusReportService],
})
export class SalesModule {}
