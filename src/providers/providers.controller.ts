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
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProvidersService } from './providers.service';

@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PROVIDERS_VIEW)
  findAll() {
    return this.providersService.findAll();
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PROVIDERS_VIEW)
  findOne(@Param('id') id: string) {
    return this.providersService.findOne(id);
  }

  @Post()
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PROVIDERS_MANAGE)
  create(@Body() createProviderDto: CreateProviderDto) {
    return this.providersService.create(createProviderDto);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PROVIDERS_MANAGE)
  update(
    @Param('id') id: string,
    @Body() updateProviderDto: UpdateProviderDto,
  ) {
    return this.providersService.update(id, updateProviderDto);
  }

  @Delete(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PROVIDERS_MANAGE)
  remove(@Param('id') id: string) {
    return this.providersService.remove(id);
  }
}
