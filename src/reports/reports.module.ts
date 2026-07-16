import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportHistoryService } from './report-history.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportHistoryService],
  exports: [ReportsService, ReportHistoryService],
})
export class ReportsModule {}