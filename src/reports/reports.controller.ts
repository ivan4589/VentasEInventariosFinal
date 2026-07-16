import { Controller, Get, Post, Query, UseGuards, Request, Param } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportHistoryService } from './report-history.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private reportsService: ReportsService,
    private reportHistoryService: ReportHistoryService,
  ) {}

  // ========== 1. INVENTARIO GENERAL ==========
  @Get('inventory')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  async getInventory() {
    return this.reportsService.getInventoryGeneral();
  }

  @Post('inventory/pdf')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  async generateInventoryPDF(@Request() req) {
    return this.reportsService.generateInventoryPDF(req.user.id);
  }

  // ========== 2. VENTAS POR FECHA ==========
  @Get('sales')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  async getSales(@Query() filters: ReportFiltersDto) {
    return this.reportsService.getSalesByDate(filters);
  }

  @Post('sales/pdf')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  async generateSalesPDF(@Query() filters: ReportFiltersDto, @Request() req) {
    return this.reportsService.generateSalesPDF(filters, req.user.id);
  }

  // ========== 3. RESUMEN DE VENTAS ==========
  @Get('sales-summary')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  async getSalesSummary(@Query() filters: ReportFiltersDto) {
    return this.reportsService.getSalesSummary(filters);
  }

  @Post('sales-summary/pdf')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  async generateSalesSummaryPDF(@Query() filters: ReportFiltersDto, @Request() req) {
    return this.reportsService.generateSalesSummaryPDF(filters, req.user.id);
  }

  // ========== 4. COBRANZA ==========
  @Get('collection')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  async getCollection(@Query() filters: ReportFiltersDto) {
    return this.reportsService.getCollectionReport(filters);
  }

  @Post('collection/pdf')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  async generateCollectionPDF(@Query() filters: ReportFiltersDto, @Request() req) {
    return this.reportsService.generateCollectionPDF(filters, req.user.id);
  }

  // ========== HISTORIAL ==========
  @Get('history')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  async getHistory(@Query() filters: { type?: string; dateFrom?: string; dateTo?: string }) {
    const { type, dateFrom, dateTo } = filters;
    return this.reportHistoryService.findAll({
      type: type as any,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  }

  @Get('history/:id')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  async getHistoryItem(@Param('id') id: string) {
    return this.reportHistoryService.findOne(id);
  }
}