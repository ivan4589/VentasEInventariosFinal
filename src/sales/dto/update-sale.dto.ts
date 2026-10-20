import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { $Enums } from '../../../generated/prisma/client';
import { BonusAllocationDto } from './bonus-allocation.dto';
import { SaleDetailDto } from './sale-detail.dto';

export class UpdateSaleDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleDetailDto)
  details?: SaleDetailDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonusAllocationDto)
  bonuses?: BonusAllocationDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsEnum($Enums.SaleType)
  saleType?: $Enums.SaleType;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}