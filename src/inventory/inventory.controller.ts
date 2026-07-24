import { Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  getInventory() {
    return this.inventoryService.getInventory();
  }

  @Post('pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  async generatePDF(@Request() req) {
    const result = await this.inventoryService.generateInventoryPDF(
      req.user.id,
    );

    return {
      success: true,
      pdfUrl: result.pdfUrl,
      historyId: result.historyId,
      message: 'PDF generado exitosamente',
    };
  }

  @Get('history')
  @Roles($Enums.Role.ADMIN)
  async getHistory(@Request() req) {
    return this.inventoryService.getHistory(req.user.id);
  }
}
