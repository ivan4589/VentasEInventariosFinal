import { IsOptional, IsString, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseDetailDto } from './purchase-detail.dto';

export class UpdatePurchaseDto {
  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseDetailDto)
  details?: PurchaseDetailDto[];

  @IsOptional()
  @IsBoolean()
  updatePrices?: boolean;
}