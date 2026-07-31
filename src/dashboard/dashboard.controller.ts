import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DashboardService } from './dashboard.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpi')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.DASHBOARD_VIEW)
  async getKPI(@Query() filters: DashboardFiltersDto, @Request() req: any) {
    const result = await this.dashboardService.getKPI(filters);

    if (req.user.role === $Enums.Role.ADMIN) {
      return result;
    }

    const {
      collectionToday: _collectionToday,
      totalDebt: _totalDebt,
      overdueAccounts: _overdueAccounts,
      ...commercialOverview
    } = result;

    return commercialOverview;
  }

  @Get('profit-summary')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_FINANCIAL)
  getProfitSummary(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getProfitSummary(filters);
  }

  @Get('sales-trend')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.REPORTS_SALES_ALL)
  getSalesTrend(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getSalesTrend(filters);
  }

  @Get('payment-methods')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_COLLECTIONS_ALL)
  getPaymentMethods(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getPaymentMethods(filters);
  }

  @Get('top-products')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.REPORTS_SALES_ALL)
  getTopProducts(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getTopProducts(filters);
  }

  @Get('client-types')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.DASHBOARD_VIEW)
  getClientTypes() {
    return this.dashboardService.getClientTypes();
  }

  @Get('top-debtors')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_COLLECTIONS_ALL)
  getTopDebtors(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getTopDebtors(filters);
  }

  @Get('debt-alerts')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_COLLECTIONS_ALL)
  getDebtAlerts(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getDebtAlerts(filters);
  }

  @Get('low-stock')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  getLowStock() {
    return this.dashboardService.getLowStock();
  }

  @Get('last-sales')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_VIEW_ALL)
  async getLastSales(@Query() filters: DashboardFiltersDto, @Request() req: any) {
    const sales = await this.dashboardService.getLastSales(filters);

    if (req.user.role === $Enums.Role.ADMIN) {
      return sales;
    }

    return sales.map(
      ({
        paymentStatus: _paymentStatus,
        paid: _paid,
        balance: _balance,
        paymentMethods: _paymentMethods,
        ...commercialSale
      }) => commercialSale,
    );
  }

  @Get('pending-purchases')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PURCHASES_VIEW)
  getPendingPurchases() {
    return this.dashboardService.getPendingPurchases();
  }

  @Get('purchases-summary')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PURCHASES_VIEW)
  getPurchasesSummary(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getPurchasesSummary(filters);
  }

  @Get('product-rotation')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.REPORTS_SALES_ALL)
  getProductRotation(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getProductRotation(filters);
  }

  @Get('sales-by-location')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.REPORTS_SALES_ALL)
  getSalesByLocation(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getSalesByLocation(filters);
  }
}
