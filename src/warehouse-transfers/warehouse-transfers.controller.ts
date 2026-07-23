import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateWarehouseTransferDto } from './dto/create-warehouse-transfer.dto';
import { WarehouseTransfersService } from './warehouse-transfers.service';

@Controller('warehouse-transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles($Enums.Role.ADMIN)
export class WarehouseTransfersController {
  constructor(
    private readonly warehouseTransfersService: WarehouseTransfersService,
  ) {}

  @Get()
  findAll() {
    return this.warehouseTransfersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.warehouseTransfersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateWarehouseTransferDto, @Request() req: any) {
    return this.warehouseTransfersService.create(dto, req.user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.warehouseTransfersService.cancel(id, req.user.id);
  }
}
