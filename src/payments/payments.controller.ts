import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly dataScope: DataScopeService,
  ) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.PAYMENTS_VIEW_ALL,
    PERMISSIONS.PAYMENTS_VIEW_OWN_SALES,
    PERMISSIONS.PAYMENTS_VIEW_ASSIGNED,
  )
  async findAll(
    @Request() req: any,
    @Query('saleId') saleId?: string,
    @Query('clientId') clientId?: string,
    @Query('method') method?: $Enums.PaymentMethod,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const payments = await this.paymentsService.findAll({
      saleId,
      clientId,
      method,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
    return this.dataScope.filterPaymentsForActor(payments, req.user);
  }

  @Get('sale/:saleId/status')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.PAYMENTS_VIEW_ALL,
    PERMISSIONS.PAYMENTS_VIEW_OWN_SALES,
    PERMISSIONS.PAYMENTS_VIEW_ASSIGNED,
  )
  async getSalePaymentStatus(
    @Param('saleId') saleId: string,
    @Request() req: any,
  ) {
    await this.dataScope.assertCanViewSale(saleId, req.user);
    return this.paymentsService.getSalePaymentStatus(saleId);
  }

  @Get('client/:clientId/balance')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PAYMENTS_VIEW_ALL)
  getClientBalance(@Param('clientId') clientId: string) {
    return this.paymentsService.getClientBalance(clientId);
  }

  @Get('report/collection')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_COLLECTIONS_ALL)
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
  @AnyPermissions(
    PERMISSIONS.PAYMENTS_VIEW_ALL,
    PERMISSIONS.PAYMENTS_VIEW_OWN_SALES,
    PERMISSIONS.PAYMENTS_VIEW_ASSIGNED,
  )
  async findOne(@Param('id') id: string, @Request() req: any) {
    const payment = await this.paymentsService.findOne(id);
    await this.dataScope.assertCanViewSale(payment.saleId, req.user);
    return payment;
  }

  @Post()
  @Roles($Enums.Role.ADMIN, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.PAYMENTS_CREATE_ASSIGNED)
  create(@Body() createPaymentDto: CreatePaymentDto, @Request() req: any) {
    return this.paymentsService.create(createPaymentDto, req.user);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PAYMENTS_UPDATE)
  update(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto) {
    return this.paymentsService.update(id, updatePaymentDto);
  }

  @Delete(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PAYMENTS_CANCEL)
  remove(@Param('id') id: string) {
    return this.paymentsService.remove(id);
  }
}
