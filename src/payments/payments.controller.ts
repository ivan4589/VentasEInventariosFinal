import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, PaymentMethod } from '@prisma/client';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.VENDEDOR, Role.COBRADOR)
  findAll(
    @Query('saleId') saleId?: string,
    @Query('clientId') clientId?: string,
    @Query('method') method?: PaymentMethod,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const filters = {
      saleId,
      clientId,
      method,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    };
    return this.paymentsService.findAll(filters);
  }

  @Get('sale/:saleId/status')
  @Roles(Role.ADMIN, Role.VENDEDOR, Role.COBRADOR)
  getSalePaymentStatus(@Param('saleId') saleId: string) {
    return this.paymentsService.getSalePaymentStatus(saleId);
  }

  @Get('client/:clientId/balance')
  @Roles(Role.ADMIN, Role.VENDEDOR, Role.COBRADOR)
  getClientBalance(@Param('clientId') clientId: string) {
    return this.paymentsService.getClientBalance(clientId);
  }

  @Get('report/collection')
  @Roles(Role.ADMIN, Role.COBRADOR)
  getCollectionReport(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.paymentsService.getCollectionReport({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      clientId,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.VENDEDOR, Role.COBRADOR)
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.COBRADOR)
  create(@Body() createPaymentDto: CreatePaymentDto, @Request() req) {
    return this.paymentsService.create(createPaymentDto, req.user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.COBRADOR)
  update(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto, @Request() req) {
    return this.paymentsService.update(id, updatePaymentDto, req.user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.COBRADOR)
  remove(@Param('id') id: string, @Request() req) {
    return this.paymentsService.remove(id, req.user.id);
  }
}