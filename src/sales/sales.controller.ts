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
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  findAll(
    @Request() req: any,
    @Query('status')
    status?: $Enums.SaleStatus,
    @Query('paymentStatus')
    paymentStatus?: $Enums.PaymentStatus,
    @Query('clientId') clientId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.salesService.findAll({
      status,
      paymentStatus,
      clientId,
      withDebt: req.user.role === $Enums.Role.COBRADOR,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  }

  @Get('low-stock')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  getLowStock() {
    return this.salesService.getLowStockProducts();
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Post()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  create(@Body() createSaleDto: CreateSaleDto, @Request() req: any) {
    return this.salesService.create(createSaleDto, req.user.id, req.user.role);
  }

  @Patch(':id/confirm')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  confirm(@Param('id') id: string, @Request() req: any) {
    return this.salesService.confirm(id, req.user.id);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  update(
    @Param('id') id: string,
    @Body() updateSaleDto: UpdateSaleDto,
    @Request() req: any,
  ) {
    return this.salesService.update(id, updateSaleDto, req.user.role);
  }

  @Post(':id/returns')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  createReturn(
    @Param('id') id: string,
    @Body() dto: CreateSaleReturnDto,
    @Request() req: any,
  ) {
    return this.salesService.createReturn(id, dto, req.user.id);
  }

  @Delete(':id')
  @Roles($Enums.Role.ADMIN)
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.salesService.cancel(id, req.user.id);
  }
}
