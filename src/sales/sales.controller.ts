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
import {
  AnyPermissions,
  Permissions,
} from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CancelEconomicOperationDto } from '../economic-integrity/dto/cancel-economic-operation.dto';
import { EconomicIntegrityService } from '../economic-integrity/economic-integrity.service';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SendSaleWhatsAppDto } from './dto/send-sale-whatsapp.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { SalesService } from './sales.service';
import { WhatsAppService } from './whatsapp.service';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly whatsappService: WhatsAppService,
    private readonly dataScope: DataScopeService,
    private readonly integrity: EconomicIntegrityService,
  ) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(PERMISSIONS.SALES_VIEW_ALL, PERMISSIONS.SALES_VIEW_ASSIGNED)
  async findAll(
    @Request() req: any,
    @Query('status') status?: $Enums.SaleStatus,
    @Query('paymentStatus') paymentStatus?: $Enums.PaymentStatus,
    @Query('clientId') clientId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const sales = await this.salesService.findAll({
      status,
      paymentStatus,
      clientId,
      withDebt: req.user.role === $Enums.Role.COBRADOR,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
    const scoped = await this.dataScope.filterSalesForActor(sales, req.user);
    return this.dataScope.sanitizeSalesForActor(scoped, req.user);
  }

  @Get('low-stock')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  getLowStock() {
    return this.salesService.getLowStockProducts();
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(PERMISSIONS.SALES_VIEW_ALL, PERMISSIONS.SALES_VIEW_ASSIGNED)
  async findOne(@Param('id') id: string, @Request() req: any) {
    await this.dataScope.assertCanViewSale(id, req.user);
    const sale = await this.salesService.findOne(id);
    return this.dataScope.sanitizeSaleForActor(sale, req.user);
  }

  @Post()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_CREATE)
  create(
    @Body() dto: CreateSaleDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: [
        'sale-number-sequence',
        `client:${dto.clientId}`,
        ...dto.details.map((detail) => `stock:${detail.productId}`),
      ],
      userId: req.user.id,
      action: 'SALE_CREATED',
      entityType: 'SALE',
      execute: async (key) => {
        const value = await this.salesService.create(
          dto,
          req.user.id,
          req.user.role,
          key,
        );
        return {
          entityId: value.id,
          value,
          details: { total: value.total, saleNumber: value.saleNumber },
        };
      },
      resolveExisting: (id) => this.salesService.findOne(id),
    });
  }

  @Patch(':id/confirm')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_CONFIRM_OWN)
  async confirm(
    @Param('id') id: string,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    await this.dataScope.assertCanManageSale(id, req.user);
    return this.integrity.run({
      operationKey,
      locks: [`sale:${id}`],
      userId: req.user.id,
      action: 'SALE_CONFIRMED',
      entityType: 'SALE',
      execute: async () => {
        const value = await this.salesService.confirm(id, req.user.id);
        return { entityId: id, value, details: { saleNumber: value.saleNumber } };
      },
      resolveExisting: () => this.salesService.findOne(id),
    });
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_UPDATE_OWN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSaleDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    await this.dataScope.assertCanManageSale(id, req.user);
    return this.integrity.run({
      operationKey,
      locks: [`sale:${id}`, ...(dto.details || []).map((d) => `stock:${d.productId}`)],
      userId: req.user.id,
      action: 'SALE_UPDATED',
      entityType: 'SALE',
      execute: async () => {
        const value = await this.salesService.update(id, dto, req.user.role);
        return { entityId: id, value, details: { total: value.total } };
      },
      resolveExisting: () => this.salesService.findOne(id),
    });
  }

  @Post(':id/whatsapp')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_WHATSAPP_OWN)
  async sendWhatsApp(
    @Param('id') id: string,
    @Body() dto: SendSaleWhatsAppDto,
    @Request() req: any,
  ) {
    await this.dataScope.assertCanManageSale(id, req.user);
    return this.whatsappService.sendSaleDocument(id, req.user.id, dto.resend ?? false);
  }

  @Post(':id/returns')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_RETURN_OWN)
  async createReturn(
    @Param('id') id: string,
    @Body() dto: CreateSaleReturnDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    await this.dataScope.assertCanManageSale(id, req.user);
    const reason = this.integrity.reason(dto.observations, 'registrar la devolución');
    return this.integrity.run({
      operationKey,
      locks: [`sale:${id}`],
      userId: req.user.id,
      action: 'SALE_RETURNED',
      entityType: 'SALE_RETURN',
      reason,
      execute: async (key) => {
        const value = await this.salesService.createReturn(id, dto, req.user.id, key);
        return {
          entityId: value.return.id,
          value,
          details: { saleId: id, amount: value.return.amount },
        };
      },
      resolveExisting: async () => {
        const sale = await this.salesService.findOne(id);
        return { message: 'La devolución ya había sido registrada', sale } as any;
      },
    });
  }

  @Patch(':id/cancel')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.SALES_CANCEL)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'anular la venta');
    return this.integrity.run({
      operationKey,
      locks: [`sale:${id}`],
      userId: req.user.id,
      action: 'SALE_CANCELLED',
      entityType: 'SALE',
      reason,
      execute: async () => {
        const value = await this.salesService.cancel(id, req.user.id, reason);
        return { entityId: id, value, details: { saleNumber: value.saleNumber } };
      },
      resolveExisting: () => this.salesService.findOne(id),
    });
  }
}
