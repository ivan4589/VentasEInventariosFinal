import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { DataScopeService } from '../auth/authorization/data-scope.service';
import { PERMISSIONS } from '../auth/authorization/permissions';
import {
  AnyPermissions,
  Permissions,
} from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AnalyticsReportFiltersDto } from './dto/analytics-report-filters.dto';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { AnalyticsReportsService } from './analytics-reports.service';
import { ReportHistoryService } from './report-history.service';
import { ReportsService } from './reports.service';

interface AuthenticatedRequest {
  user: {
    id: number;
    role: $Enums.Role;
  };
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportHistoryService: ReportHistoryService,
    private readonly analyticsReportsService: AnalyticsReportsService,
    private readonly dataScope: DataScopeService,
  ) {}

  @Get('catalog')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.REPORTS_FINANCIAL,
    PERMISSIONS.REPORTS_SALES_ALL,
    PERMISSIONS.REPORTS_COLLECTIONS_ASSIGNED,
    PERMISSIONS.REPORTS_INVENTORY,
  )
  getCatalog(@Request() req: AuthenticatedRequest) {
    const catalog = this.analyticsReportsService.getCatalog(req.user.role);
    return this.dataScope.filterAnalyticsCatalog(catalog, req.user.role);
  }

  @Get('data/:reportKey')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.REPORTS_FINANCIAL,
    PERMISSIONS.REPORTS_SALES_ALL,
    PERMISSIONS.REPORTS_COLLECTIONS_ASSIGNED,
    PERMISSIONS.REPORTS_INVENTORY,
  )
  getAnalyticsReport(
    @Param('reportKey') reportKey: string,
    @Query() filters: AnalyticsReportFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    this.dataScope.assertAnalyticsReportAccess(reportKey, req.user.role);
    return this.analyticsReportsService.getReport(reportKey, filters, req.user);
  }

  @Post('pdf/:reportKey')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.REPORTS_FINANCIAL,
    PERMISSIONS.REPORTS_SALES_ALL,
    PERMISSIONS.REPORTS_COLLECTIONS_ASSIGNED,
    PERMISSIONS.REPORTS_INVENTORY,
  )
  generateAnalyticsReportPdf(
    @Param('reportKey') reportKey: string,
    @Query() filters: AnalyticsReportFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    this.dataScope.assertAnalyticsReportAccess(reportKey, req.user.role);
    return this.analyticsReportsService.generatePdf(reportKey, filters, req.user);
  }

  @Post('pdf/sales-detail/matrix')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.REPORTS_SALES_ALL)
  generateSalesMatrixPdf(
    @Query() filters: AnalyticsReportFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.analyticsReportsService.generateSalesMatrixPdf(filters, req.user);
  }

  @Get('inventory')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.REPORTS_INVENTORY)
  getInventory() {
    return this.reportsService.getInventoryGeneral();
  }

  @Post('inventory/pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.REPORTS_INVENTORY)
  generateInventoryPDF(@Request() req: AuthenticatedRequest) {
    return this.reportsService.generateInventoryPDF(req.user.id);
  }

  @Get('sales')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.REPORTS_SALES_ALL)
  getSales(@Query() filters: ReportFiltersDto) {
    return this.reportsService.getSalesByDate(filters);
  }

  @Post('sales/pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.REPORTS_SALES_ALL)
  generateSalesPDF(
    @Query() filters: ReportFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reportsService.generateSalesPDF(filters, req.user.id);
  }

  @Get('sales-summary')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.REPORTS_SALES_ALL)
  getSalesSummary(@Query() filters: ReportFiltersDto) {
    return this.reportsService.getSalesSummary(filters);
  }

  @Post('sales-summary/pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.REPORTS_SALES_ALL)
  generateSalesSummaryPDF(
    @Query() filters: ReportFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reportsService.generateSalesSummaryPDF(filters, req.user.id);
  }

  @Get('collection')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_COLLECTIONS_ALL)
  getCollection(@Query() filters: ReportFiltersDto) {
    return this.reportsService.getCollectionReport(filters);
  }

  @Post('collection/pdf')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_COLLECTIONS_ALL)
  generateCollectionPDF(
    @Query() filters: ReportFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reportsService.generateCollectionPDF(filters, req.user.id);
  }

  @Get('history')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.REPORTS_HISTORY_ALL,
    PERMISSIONS.REPORTS_HISTORY_OWN,
  )
  getHistory(
    @Query() filters: ReportFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reportHistoryService.findAll({
      type: filters.type,
      dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
      userId: req.user.role === $Enums.Role.ADMIN ? undefined : req.user.id,
    });
  }

  @Get('history/:id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.REPORTS_HISTORY_ALL,
    PERMISSIONS.REPORTS_HISTORY_OWN,
  )
  getHistoryItem(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reportHistoryService.findOne(
      id,
      req.user.role === $Enums.Role.ADMIN ? undefined : req.user.id,
    );
  }
}
