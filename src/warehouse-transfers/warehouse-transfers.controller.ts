import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
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
import { CreateWarehouseTransferDto } from './dto/create-warehouse-transfer.dto';
import { WarehouseTransfersService } from './warehouse-transfers.service';

@Controller('warehouse-transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles($Enums.Role.ADMIN)
@Permissions(PERMISSIONS.INVENTORY_TRANSFER)
export class WarehouseTransfersController {
  constructor(
    private readonly service: WarehouseTransfersService,
    private readonly integrity: EconomicIntegrityService,
  ) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateWarehouseTransferDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: dto.details.flatMap((detail) => [
        `stock:${dto.originWarehouseId}:${detail.productId}`,
        `stock:${dto.destinationWarehouseId}:${detail.productId}`,
      ]),
      userId: req.user.id,
      action: 'WAREHOUSE_TRANSFER_CREATED',
      entityType: 'WAREHOUSE_TRANSFER',
      execute: async (key) => {
        const value = await this.service.create(dto, req.user.id, key);
        return {
          entityId: value!.id,
          value,
          details: { transferNumber: value!.transferNumber },
        };
      },
      resolveExisting: (id) => this.service.findOne(id),
    });
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'anular la transferencia');
    return this.integrity.run({
      operationKey,
      locks: [`warehouse-transfer:${id}`],
      userId: req.user.id,
      action: 'WAREHOUSE_TRANSFER_CANCELLED',
      entityType: 'WAREHOUSE_TRANSFER',
      reason,
      execute: async () => {
        const value = await this.service.cancel(id, req.user.id, reason);
        return { entityId: id, value, details: { transferNumber: value!.transferNumber } };
      },
      resolveExisting: () => this.service.findOne(id),
    });
  }
}
