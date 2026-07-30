import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehousesService } from './warehouses.service';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  findAll() {
    return this.warehousesService.findAll();
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  @Post()
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.INVENTORY_MANAGE)
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(dto);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.INVENTORY_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(id, dto);
  }

  @Delete(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.INVENTORY_MANAGE)
  remove(@Param('id') id: string) {
    return this.warehousesService.remove(id);
  }
}
