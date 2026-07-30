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
import { CreateLocationDto } from './dto/create-location.dto';
import { LocationsService } from './locations.service';
import { UpdateLocationDto } from './dto/update-location.dto';

@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  create(@Body() createLocationDto: CreateLocationDto) {
    return this.locationsService.create(createLocationDto);
  }

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  findAll() {
    return this.locationsService.findAll();
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  findOne(@Param('id') id: string) {
    return this.locationsService.findOne(id);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  update(
    @Param('id') id: string,
    @Body() updateLocationDto: UpdateLocationDto,
  ) {
    return this.locationsService.update(id, updateLocationDto);
  }

  @Delete(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  remove(@Param('id') id: string) {
    return this.locationsService.remove(id);
  }
}
