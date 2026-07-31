import {
  Body,
  Controller,
  Get,
  Headers,
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
import { AnyPermissions, Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CancelEconomicOperationDto } from '../economic-integrity/dto/cancel-economic-operation.dto';
import { EconomicIntegrityService } from '../economic-integrity/economic-integrity.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly dataScope: DataScopeService,
    private readonly integrity: EconomicIntegrityService,
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
    await this.dataScope.assertCanViewSaleFinancials(saleId, req.user);
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
    await this.dataScope.assertCanViewSaleFinancials(payment.saleId, req.user);
    return payment;
  }

  @Post()
  @Roles($Enums.Role.ADMIN, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.PAYMENTS_CREATE_ASSIGNED)
  create(
    @Body() dto: CreatePaymentDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: [`sale:${dto.saleId}`],
      userId: req.user.id,
      action: 'PAYMENT_REGISTERED',
      entityType: 'PAYMENT',
      execute: async (key) => {
        const value = await this.paymentsService.create(dto, req.user, key);
        return {
          entityId: value.id,
          value,
          details: { saleId: value.saleId, amount: value.amount, method: value.method },
        };
      },
      resolveExisting: (id) => this.paymentsService.findOne(id),
    });
  }

  @Patch(':id/cancel')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PAYMENTS_CANCEL)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'anular el pago');
    return this.integrity.run({
      operationKey,
      locks: [`payment:${id}`],
      userId: req.user.id,
      action: 'PAYMENT_REVERSED',
      entityType: 'PAYMENT',
      reason,
      execute: async (key) => {
        const value = await this.paymentsService.remove(id, req.user.id, reason, key);
        return {
          entityId: value.id,
          value,
          details: { originalPaymentId: id, reversalAmount: value.amount },
        };
      },
      resolveExisting: (reversalId) => this.paymentsService.findOne(reversalId),
    });
  }
}
