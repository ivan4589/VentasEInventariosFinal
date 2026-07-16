import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpi')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getKPI(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getKPI(filters);
  }

  @Get('sales-trend')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getSalesTrend(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getSalesTrend(filters);
  }

  @Get('payment-methods')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getPaymentMethods(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getPaymentMethods(filters);
  }

  @Get('top-products')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getTopProducts(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getTopProducts(filters);
  }

  @Get('client-types')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getClientTypes() {
    return this.dashboardService.getClientTypes();
  }

  @Get('top-debtors')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getTopDebtors(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getTopDebtors(filters);
  }

  @Get('low-stock')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getLowStock() {
    return this.dashboardService.getLowStock();
  }

  @Get('last-sales')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getLastSales(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getLastSales(filters);
  }
}