import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { InventoryService } from './inventory.service';
import { GenerateInventoryPdfDto } from './dto/generate-inventory-pdf.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  async getInventory(@Query('categoryId') categoryId?: string) {
    const items = await this.inventoryService.getInventory(categoryId);

    return {
      items,
      generatedAt: new Date(),
      totalProducts: items.length,
      totalStock: items.reduce((sum, product) => sum + product.stock, 0),
      lowStockProducts: items.filter(
        (product) => product.stock <= product.minStock && product.minStock > 0,
      ).length,
    };
  }

  @Post('pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  async generatePDF(@Body() dto: GenerateInventoryPdfDto, @Request() req) {
    const result = await this.inventoryService.generateInventoryPDF(
      req.user.id,
      dto.categoryId,
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