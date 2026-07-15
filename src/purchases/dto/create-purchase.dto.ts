import { IsNotEmpty, IsOptional, IsString, IsUUID, IsArray, ValidateNested, IsBoolean, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseDetailDto } from './purchase-detail.dto';

export class CreatePurchaseDto {
  @IsUUID()
  @IsNotEmpty()
  providerId: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseDetailDto)
  details: PurchaseDetailDto[];

  @IsOptional()
  @IsBoolean()
  updatePrices?: boolean; // Si es true, recalcula precios de venta
}