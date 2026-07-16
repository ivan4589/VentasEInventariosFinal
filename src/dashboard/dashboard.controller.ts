import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { DashboardService } from './dashboard.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpi')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getKPI(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getKPI(filters);
  }

  @Get('profit-summary')
  @Roles($Enums.Role.ADMIN)
  getProfitSummary(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getProfitSummary(filters);
  }

  @Get('sales-trend')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getSalesTrend(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getSalesTrend(filters);
  }

  @Get('payment-methods')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  getPaymentMethods(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getPaymentMethods(filters);
  }

  @Get('top-products')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getTopProducts(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getTopProducts(filters);
  }

  @Get('client-types')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getClientTypes() {
    return this.dashboardService.getClientTypes();
  }

  @Get('top-debtors')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  getTopDebtors(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getTopDebtors(filters);
  }

  @Get('debt-alerts')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  getDebtAlerts(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getDebtAlerts(filters);
  }

  @Get('low-stock')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getLowStock() {
    return this.dashboardService.getLowStock();
  }

  @Get('last-sales')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getLastSales(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getLastSales(filters);
  }

  @Get('pending-purchases')
  @Roles($Enums.Role.ADMIN)
  getPendingPurchases() {
    return this.dashboardService.getPendingPurchases();
  }

  @Get('purchases-summary')
  @Roles($Enums.Role.ADMIN)
  getPurchasesSummary(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getPurchasesSummary(filters);
  }

  @Get('product-rotation')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getProductRotation(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getProductRotation(filters);
  }

  @Get('sales-by-location')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getSalesByLocation(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getSalesByLocation(filters);
  }
}