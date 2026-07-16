import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Request,
  Param,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { ReportsService } from './reports.service';
import { ReportHistoryService } from './report-history.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportHistoryService: ReportHistoryService,
  ) {}

  @Get('inventory')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getInventory() {
    return this.reportsService.getInventoryGeneral();
  }

  @Post('inventory/pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  generateInventoryPDF(@Request() req) {
    return this.reportsService.generateInventoryPDF(req.user.id);
  }

  @Get('sales')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getSales(@Query() filters: ReportFiltersDto) {
    return this.reportsService.getSalesByDate(filters);
  }

  @Post('sales/pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  generateSalesPDF(@Query() filters: ReportFiltersDto, @Request() req) {
    return this.reportsService.generateSalesPDF(filters, req.user.id);
  }

  @Get('sales-summary')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getSalesSummary(@Query() filters: ReportFiltersDto) {
    return this.reportsService.getSalesSummary(filters);
  }

  @Post('sales-summary/pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  generateSalesSummaryPDF(@Query() filters: ReportFiltersDto, @Request() req) {
    return this.reportsService.generateSalesSummaryPDF(filters, req.user.id);
  }

  @Get('collection')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  getCollection(@Query() filters: ReportFiltersDto) {
    return this.reportsService.getCollectionReport(filters);
  }

  @Post('collection/pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.COBRADOR)
  generateCollectionPDF(@Query() filters: ReportFiltersDto, @Request() req) {
    return this.reportsService.generateCollectionPDF(filters, req.user.id);
  }

  @Get('history')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  getHistory(@Query() filters: ReportFiltersDto) {
    return this.reportHistoryService.findAll({
      type: filters.type,
      dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
    });
  }

  @Get('history/:id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  getHistoryItem(@Param('id') id: string) {
    return this.reportHistoryService.findOne(id);
  }
}