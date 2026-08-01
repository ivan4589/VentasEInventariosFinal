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
import { PERMISSIONS } from '../auth/authorization/permissions';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CancelEconomicOperationDto } from '../economic-integrity/dto/cancel-economic-operation.dto';
import { EconomicIntegrityService } from '../economic-integrity/economic-integrity.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles($Enums.Role.ADMIN)
export class PurchasesController {
  constructor(
    private readonly service: PurchasesService,
    private readonly integrity: EconomicIntegrityService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.PURCHASES_VIEW)
  findAll(
    @Query('status') status?: $Enums.PurchaseStatus,
    @Query('providerId') providerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.findAll({
      status,
      providerId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PURCHASES_VIEW)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  create(
    @Body() dto: CreatePurchaseDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: dto.details.map((detail) => `purchase-product:${detail.productId}`),
      userId: req.user.id,
      action: 'PURCHASE_CREATED',
      entityType: 'PURCHASE',
      execute: async (key) => {
        const value = await this.service.create(dto, req.user.id, key);
        return { entityId: value.id, value, details: { total: value.total } };
      },
      resolveExisting: (id) => this.service.findOne(id),
    });
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: [`purchase:${id}`],
      userId: req.user.id,
      action: 'PURCHASE_UPDATED',
      entityType: 'PURCHASE',
      execute: async () => {
        const value = await this.service.update(id, dto);
        return { entityId: id, value, details: { total: value.total } };
      },
      resolveExisting: () => this.service.findOne(id),
    });
  }

  @Patch(':id/providers/:purchaseProviderId/receive')
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  receiveProvider(
    @Param('id') id: string,
    @Param('purchaseProviderId') providerId: string,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: [`purchase:${id}`, `purchase-provider:${providerId}`],
      userId: req.user.id,
      action: 'PURCHASE_PROVIDER_RECEIVED',
      entityType: 'PURCHASE',
      execute: async () => {
        const value = await this.service.receiveProvider(id, providerId, req.user.id);
        return { entityId: id, value, details: { purchaseProviderId: providerId } };
      },
      resolveExisting: () => this.service.findOne(id),
    });
  }

  @Patch(':id/providers/:purchaseProviderId/cancel')
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  cancelProvider(
    @Param('id') id: string,
    @Param('purchaseProviderId') providerId: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'anular la recepción del proveedor');
    return this.integrity.run({
      operationKey,
      locks: [`purchase:${id}`, `purchase-provider:${providerId}`],
      userId: req.user.id,
      action: 'PURCHASE_PROVIDER_CANCELLED',
      entityType: 'PURCHASE',
      reason,
      execute: async () => {
        const value = await this.service.cancelProvider(
          id,
          providerId,
          req.user.id,
          reason,
        );
        return { entityId: id, value, details: { purchaseProviderId: providerId } };
      },
      resolveExisting: () => this.service.findOne(id),
    });
  }

  @Patch(':id/cancel')
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'anular la compra');
    return this.integrity.run({
      operationKey,
      locks: [`purchase:${id}`],
      userId: req.user.id,
      action: 'PURCHASE_CANCELLED',
      entityType: 'PURCHASE',
      reason,
      execute: async () => {
        const value = await this.service.cancel(id, req.user.id, reason);
        return { entityId: id, value, details: { total: value.total } };
      },
      resolveExisting: () => this.service.findOne(id),
    });
  }
}
