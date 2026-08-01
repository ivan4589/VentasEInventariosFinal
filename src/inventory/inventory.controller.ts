import {
  Body,
  Controller,
  Get,
  Headers,
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
import { EconomicIntegrityService } from '../economic-integrity/economic-integrity.service';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly integrity: EconomicIntegrityService,
  ) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  getInventory() {
    return this.inventoryService.getInventory();
  }

  @Post('adjustments')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.INVENTORY_MANAGE)
  adjustStock(
    @Body() dto: AdjustInventoryDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'ajustar el inventario');
    return this.integrity.run({
      operationKey,
      locks: [`stock:${dto.warehouseId}:${dto.productId}`],
      userId: req.user.id,
      action: 'INVENTORY_ADJUSTED',
      entityType: 'INVENTORY_MOVEMENT',
      reason,
      execute: async () => {
        const value = await this.inventoryService.adjustStock(
          { ...dto, reason },
          req.user.id,
        );
        return {
          entityId: value.movementId,
          value,
          details: {
            warehouseId: dto.warehouseId,
            productId: dto.productId,
            previousStock: value.previousStock,
            quantityChange: value.quantityChange,
            newStock: value.newStock,
          },
        };
      },
      resolveExisting: () =>
        this.inventoryService.getStockPosition(dto.warehouseId, dto.productId),
    });
  }

  @Post('pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.REPORTS_INVENTORY)
  async generatePDF(@Request() req: any) {
    const result = await this.inventoryService.generateInventoryPDF(req.user.id);
    return {
      success: true,
      pdfUrl: result.pdfUrl,
      historyId: result.historyId,
      message: 'PDF generado exitosamente',
    };
  }

  @Get('history')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_HISTORY_ALL)
  getHistory(@Request() req: any) {
    return this.inventoryService.getHistory(req.user.id);
  }
}
