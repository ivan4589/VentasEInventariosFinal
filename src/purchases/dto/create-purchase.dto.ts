import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseDetailDto } from './purchase-detail.dto';

export class CreatePurchaseDto {
  @IsString()
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
  updatePrices?: boolean;
}