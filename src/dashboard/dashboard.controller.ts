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

  @Get('sales-trend')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getSalesTrend(@Query() filters: DashboardFiltersDto) {
    return this.dashboardService.getSalesTrend(filters);
  }

  @Get('payment-methods')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
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
}