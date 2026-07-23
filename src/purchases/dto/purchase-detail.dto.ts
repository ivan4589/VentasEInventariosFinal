import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseWarehouseDistributionDto } from './purchase-warehouse-distribution.dto';

export class PurchaseDetailDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  unitPrice: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceNormal: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceCamino: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceEspecial: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMayorista?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minQuantityWholesale?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseWarehouseDistributionDto)
  warehouseDistributions?: PurchaseWarehouseDistributionDto[];
}
