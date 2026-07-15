import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { ConfirmSaleDto } from './dto/confirm-sale.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, SaleStatus, PaymentStatus } from '@prisma/client';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  findAll(
    @Query('status') status?: SaleStatus,
    @Query('paymentStatus') paymentStatus?: PaymentStatus,
    @Query('clientId') clientId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const filters = {
      status,
      paymentStatus,
      clientId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    };
    return this.salesService.findAll(filters);
  }

  @Get('low-stock')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getLowStock() {
    return this.salesService.getLowStockProducts();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  create(@Body() createSaleDto: CreateSaleDto, @Request() req) {
    return this.salesService.create(createSaleDto, req.user.id);
  }

  @Patch(':id/confirm')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  confirm(@Param('id') id: string, @Request() req) {
    return this.salesService.confirm(id, req.user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  update(@Param('id') id: string, @Body() updateSaleDto: UpdateSaleDto, @Request() req) {
    return this.salesService.update(id, updateSaleDto, req.user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  cancel(@Param('id') id: string, @Request() req) {
    return this.salesService.cancel(id, req.user.id);
  }
}