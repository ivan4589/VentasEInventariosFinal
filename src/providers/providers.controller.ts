import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  findAll() {
    return this.providersService.findAll();
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  findOne(@Param('id') id: string) {
    return this.providersService.findOne(id);
  }

  @Post()
  @Roles($Enums.Role.ADMIN)
  create(@Body() createProviderDto: CreateProviderDto) {
    return this.providersService.create(createProviderDto);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateProviderDto: UpdateProviderDto,
  ) {
    return this.providersService.update(id, updateProviderDto);
  }

  @Delete(':id')
  @Roles($Enums.Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.providersService.remove(id);
  }
}