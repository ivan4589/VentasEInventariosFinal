import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { $Enums } from '../../../generated/prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../../auth/authorization/permissions';
import { BonusReportService } from './bonus-report.service';

@Controller('reports/bonuses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BonusReportController {
  constructor(private readonly reports: BonusReportService) {}

  @Get()
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_FINANCIAL)
  get(@Query('dateFrom') dateFrom: string, @Query('dateTo') dateTo: string) {
    return this.reports.getReport(dateFrom,dateTo);
  }
}
