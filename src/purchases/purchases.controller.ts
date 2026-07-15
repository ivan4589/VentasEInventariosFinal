import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { ReceivePurchaseDto } from './dto/receive-purchase.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
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
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  findOne(@Param('id') id: string) {
    return this.purchasesService.findOne(id);
  }

  @Post()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  create(@Body() createPurchaseDto: CreatePurchaseDto, @Request() req) {
    return this.purchasesService.create(createPurchaseDto, req.user.id);
  }

  @Patch(':id/receive')
  @Roles($Enums.Role.ADMIN)
  receive(
    @Param('id') id: string,
    @Body() receiveDto: ReceivePurchaseDto,
    @Request() req,
  ) {
    return this.purchasesService.receive(id, receiveDto, req.user.id);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN)
  update(@Param('id') id: string, @Body() updatePurchaseDto: UpdatePurchaseDto) {
    return this.purchasesService.update(id, updatePurchaseDto);
  }

  @Delete(':id')
  @Roles($Enums.Role.ADMIN)
  cancel(@Param('id') id: string) {
    return this.purchasesService.cancel(id);
  }
}