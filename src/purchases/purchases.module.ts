import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { ReportsModule } from '../reports/reports.module';
import { $Enums } from '../../generated/prisma/client';

@Module({
  imports: [ReportsModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}