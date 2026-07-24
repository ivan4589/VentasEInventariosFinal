import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportHistoryService } from './report-history.service';
import { AnalyticsReportsService } from './analytics-reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportHistoryService, AnalyticsReportsService],
  exports: [ReportsService, ReportHistoryService, AnalyticsReportsService],
})
export class ReportsModule {}
