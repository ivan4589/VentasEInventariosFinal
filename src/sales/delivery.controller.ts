import { Body, Controller, Get, Headers, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { $Enums } from '../../generated/prisma/client';
import { DataScopeService } from '../auth/authorization/data-scope.service';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DeliveryService } from './delivery.service';

class DeliveryEventDto {
  @IsString() productId!: string;
  @IsIn(['DELIVER', 'RETURN']) kind!: 'DELIVER' | 'RETURN';
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @Type(() => Number) @IsInt() @Min(0) expectedRevision!: number;
}

class DeliveryQuantityDto {
  @IsString() productId!: string;
  @Type(() => Number) @IsInt() @Min(0) quantity!: number;
  @Type(() => Number) @IsInt() @Min(0) expectedRevision!: number;
}

@Controller('sales/:id/delivery')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService, private readonly scope: DataScopeService) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_VIEW_ALL)
  async summary(@Param('id') id: string, @Request() req: any) {
    await this.scope.assertCanViewSale(id, req.user);
    return this.delivery.summary(id);
  }

  @Post('start')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_UPDATE_ALL)
  async start(@Param('id') id: string, @Request() req: any) {
    await this.scope.assertCanManagePresale(id, req.user);
    return this.delivery.start(id);
  }

  @Post('events')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_UPDATE_ALL)
  async record(@Param('id') id: string, @Body() body: DeliveryEventDto,
      @Headers('idempotency-key') key: string, @Request() req: any) {
    await this.scope.assertCanManagePresale(id, req.user);
    return this.delivery.record(id, body.productId, body.kind, body.quantity, body.expectedRevision, key, req.user.id);
  }

  @Patch('quantity')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_UPDATE_ALL)
  async adjust(@Param('id') id: string, @Body() body: DeliveryQuantityDto, @Request() req: any) {
    await this.scope.assertCanManagePresale(id, req.user);
    return this.delivery.adjustQuantity(id, body.productId, body.quantity, body.expectedRevision);
  }

  @Patch('confirm')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_CONFIRM_ALL)
  async confirm(@Param('id') id: string, @Request() req: any) {
    await this.scope.assertCanManagePresale(id, req.user);
    return this.delivery.confirm(id, req.user.id);
  }
}
