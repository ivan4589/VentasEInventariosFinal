import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportsModule } from '../reports/reports.module';
import { BonusRulesService } from './bonuses/bonus-rules.service';
import { BonusRulesController } from './bonuses/bonus-rules.controller';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [ReportsModule, AuthModule],
  controllers: [SalesController, BonusRulesController],
  providers: [SalesService, WhatsAppService, BonusRulesService],
})
export class SalesModule {}
