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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.CLIENTS_VIEW)
  findAll(
    @Request() req: any,
    @Query('locationId') locationId?: string,
    @Query('type') type?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const includeAll =
      req.user.role === $Enums.Role.ADMIN && includeInactive === 'true';
    if (locationId) {
      return this.clientsService.findByLocation(locationId, includeAll);
    }
    if (type) return this.clientsService.findByType(type, includeAll);
    return this.clientsService.findAll(includeAll);
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.CLIENTS_VIEW)
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.clientsService.findOne(
      id,
      req.user.role === $Enums.Role.ADMIN,
    );
  }

  @Post()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.CLIENTS_CREATE)
  create(@Body() dto: CreateClientDto, @Request() req: any) {
    return this.clientsService.create(dto, req.user.id);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.CLIENTS_UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @Request() req: any,
  ) {
    return this.clientsService.update(id, dto, req.user.id);
  }

  @Patch(':id/deactivate')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.CLIENTS_DELETE)
  deactivate(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
  ) {
    return this.clientsService.deactivate(id, req.user.id, dto.reason);
  }

  @Patch(':id/reactivate')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.CLIENTS_DELETE)
  reactivate(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
  ) {
    return this.clientsService.reactivate(id, req.user.id, dto.reason);
  }
}
