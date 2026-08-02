import {
  Body,
  Controller,
  Get,
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
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProvidersService } from './providers.service';

@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles($Enums.Role.ADMIN)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  @Permissions(PERMISSIONS.PROVIDERS_VIEW)
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.providersService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PROVIDERS_VIEW)
  findOne(@Param('id') id: string) {
    return this.providersService.findOne(id, true);
  }

  @Post()
  @Permissions(PERMISSIONS.PROVIDERS_MANAGE)
  create(@Body() dto: CreateProviderDto, @Request() req: any) {
    return this.providersService.create(dto, req.user.id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PROVIDERS_MANAGE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
    @Request() req: any,
  ) {
    return this.providersService.update(id, dto, req.user.id);
  }

  @Patch(':id/deactivate')
  @Permissions(PERMISSIONS.PROVIDERS_MANAGE)
  deactivate(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
  ) {
    return this.providersService.deactivate(id, req.user.id, dto.reason);
  }

  @Patch(':id/reactivate')
  @Permissions(PERMISSIONS.PROVIDERS_MANAGE)
  reactivate(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
  ) {
    return this.providersService.reactivate(id, req.user.id, dto.reason);
  }
}
