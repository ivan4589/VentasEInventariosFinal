import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { ReceivePurchaseDto } from './dto/receive-purchase.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, PurchaseStatus } from '@prisma/client';

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  findAll(
    @Query('status') status?: PurchaseStatus,
    @Query('providerId') providerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const filters = {
      status,
      providerId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    };
    return this.purchasesService.findAll(filters);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  findOne(@Param('id') id: string) {
    return this.purchasesService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  create(@Body() createPurchaseDto: CreatePurchaseDto, @Request() req) {
    return this.purchasesService.create(createPurchaseDto, req.user.id);
  }

  @Patch(':id/receive')
  @Roles(Role.ADMIN)
  receive(@Param('id') id: string, @Body() receiveDto: ReceivePurchaseDto, @Request() req) {
    return this.purchasesService.receive(id, receiveDto, req.user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() updatePurchaseDto: UpdatePurchaseDto, @Request() req) {
    return this.purchasesService.update(id, updatePurchaseDto, req.user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  cancel(@Param('id') id: string, @Request() req) {
    return this.purchasesService.cancel(id, req.user.id);
  }
}