import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  findAll(
    @Query('saleId') saleId?: string,
    @Query('clientId') clientId?: string,
    @Query('method') method?: $Enums.PaymentMethod,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.paymentsService.findAll({
      saleId,
      clientId,
      method,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  }

  @Get('sale/:saleId/status')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  getSalePaymentStatus(@Param('saleId') saleId: string) {
    return this.paymentsService.getSalePaymentStatus(saleId);
  }

  @Get('client/:clientId/balance')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  getClientBalance(@Param('clientId') clientId: string) {
    return this.paymentsService.getClientBalance(clientId);
  }

  @Get('report/collection')
  @Roles($Enums.Role.ADMIN, $Enums.Role.COBRADOR)
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
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Post()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  create(@Body() createPaymentDto: CreatePaymentDto, @Request() req) {
    return this.paymentsService.create(createPaymentDto, req.user);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  update(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto) {
    return this.paymentsService.update(id, updatePaymentDto);
  }

  @Delete(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  remove(@Param('id') id: string) {
    return this.paymentsService.remove(id);
  }
}
