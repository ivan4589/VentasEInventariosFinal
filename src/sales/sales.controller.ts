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
import { DataScopeService } from '../auth/authorization/data-scope.service';
import { PERMISSIONS } from '../auth/authorization/permissions';
import {
  AnyPermissions,
  Permissions,
} from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SendSaleWhatsAppDto } from './dto/send-sale-whatsapp.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { SalesService } from './sales.service';
import { WhatsAppService } from './whatsapp.service';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly whatsappService: WhatsAppService,
    private readonly dataScope: DataScopeService,
  ) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.SALES_VIEW_ALL,
    PERMISSIONS.SALES_VIEW_ASSIGNED,
  )
  async findAll(
    @Request() req: any,
    @Query('status') status?: $Enums.SaleStatus,
    @Query('paymentStatus') paymentStatus?: $Enums.PaymentStatus,
    @Query('clientId') clientId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const sales = await this.salesService.findAll({
      status,
      paymentStatus,
      clientId,
      withDebt: req.user.role === $Enums.Role.COBRADOR,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });

    const scoped = await this.dataScope.filterSalesForActor(sales, req.user);
    return this.dataScope.sanitizeSalesForActor(scoped, req.user);
  }

  @Get('low-stock')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  getLowStock() {
    return this.salesService.getLowStockProducts();
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.SALES_VIEW_ALL,
    PERMISSIONS.SALES_VIEW_ASSIGNED,
  )
  async findOne(@Param('id') id: string, @Request() req: any) {
    await this.dataScope.assertCanViewSale(id, req.user);
    const sale = await this.salesService.findOne(id);
    return this.dataScope.sanitizeSaleForActor(sale, req.user);
  }

  @Post()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_CREATE)
  create(@Body() createSaleDto: CreateSaleDto, @Request() req: any) {
    return this.salesService.create(createSaleDto, req.user.id, req.user.role);
  }

  @Patch(':id/confirm')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_CONFIRM_OWN)
  async confirm(@Param('id') id: string, @Request() req: any) {
    await this.dataScope.assertCanManageSale(id, req.user);
    return this.salesService.confirm(id, req.user.id);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_UPDATE_OWN)
  async update(
    @Param('id') id: string,
    @Body() updateSaleDto: UpdateSaleDto,
    @Request() req: any,
  ) {
    await this.dataScope.assertCanManageSale(id, req.user);
    return this.salesService.update(id, updateSaleDto, req.user.role);
  }

  @Post(':id/whatsapp')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_WHATSAPP_OWN)
  async sendWhatsApp(
    @Param('id') id: string,
    @Body() dto: SendSaleWhatsAppDto,
    @Request() req: any,
  ) {
    await this.dataScope.assertCanManageSale(id, req.user);
    return this.whatsappService.sendSaleDocument(
      id,
      req.user.id,
      dto.resend ?? false,
    );
  }

  @Post(':id/returns')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_RETURN_OWN)
  async createReturn(
    @Param('id') id: string,
    @Body() dto: CreateSaleReturnDto,
    @Request() req: any,
  ) {
    await this.dataScope.assertCanManageSale(id, req.user);
    return this.salesService.createReturn(id, dto, req.user.id);
  }

  @Delete(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.SALES_CANCEL)
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.salesService.cancel(id, req.user.id);
  }
}
