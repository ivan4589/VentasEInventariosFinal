import { Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  getInventory() {
    return this.inventoryService.getInventory();
  }

  @Post('pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
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
  async getHistory(@Request() req: any) {
    return this.inventoryService.getHistory(req.user.id);
  }
}
