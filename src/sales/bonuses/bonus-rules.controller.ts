import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { $Enums } from '../../../generated/prisma/client';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../../auth/authorization/permissions';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { BonusRulesService } from './bonus-rules.service';

export class SaveBonusRuleDto {
  @IsString() subCategoryId: string;
  @Type(() => Number) @IsInt() @Min(1) minimumQuantity: number;
  @Type(() => Number) @IsInt() @Min(1) bonusQuantity: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateBonusRuleDto extends PartialType(SaveBonusRuleDto) {}

@Controller('bonus-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BonusRulesController {
  constructor(private readonly bonusRules: BonusRulesService) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  all() { return this.bonusRules.list(); }

  @Post()
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.SETTINGS_MANAGE)
  create(@Body() dto: SaveBonusRuleDto) { return this.bonusRules.create(dto); }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.SETTINGS_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateBonusRuleDto) {
    return this.bonusRules.update(id, dto);
  }
}
