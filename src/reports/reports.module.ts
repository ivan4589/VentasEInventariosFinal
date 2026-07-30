import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsReportsService } from './analytics-reports.service';
import { ReportHistoryService } from './report-history.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportHistoryService, AnalyticsReportsService],
  exports: [ReportsService, ReportHistoryService, AnalyticsReportsService],
})
export class ReportsModule {}
