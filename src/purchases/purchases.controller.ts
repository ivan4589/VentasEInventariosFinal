import {
  Body,
  Controller,
  Delete,
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
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PURCHASES_VIEW)
  findAll(
    @Query('status') status?: $Enums.PurchaseStatus,
    @Query('providerId') providerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.purchasesService.findAll({
      status,
      providerId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PURCHASES_VIEW)
  findOne(@Param('id') id: string) {
    return this.purchasesService.findOne(id);
  }

  @Post()
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  create(@Body() createPurchaseDto: CreatePurchaseDto, @Request() req: any) {
    return this.purchasesService.create(createPurchaseDto, req.user.id);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  update(
    @Param('id') id: string,
    @Body() updatePurchaseDto: UpdatePurchaseDto,
  ) {
    return this.purchasesService.update(id, updatePurchaseDto);
  }

  @Patch(':id/providers/:purchaseProviderId/receive')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  receiveProvider(
    @Param('id') id: string,
    @Param('purchaseProviderId') purchaseProviderId: string,
    @Request() req: any,
  ) {
    return this.purchasesService.receiveProvider(
      id,
      purchaseProviderId,
      req.user.id,
    );
  }

  @Patch(':id/providers/:purchaseProviderId/cancel')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  cancelProvider(
    @Param('id') id: string,
    @Param('purchaseProviderId') purchaseProviderId: string,
    @Request() req: any,
  ) {
    return this.purchasesService.cancelProvider(
      id,
      purchaseProviderId,
      req.user.id,
    );
  }

  @Delete(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.purchasesService.cancel(id, req.user.id);
  }
}
