import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'El código solo puede contener letras, números y guiones',
  })
  code?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  providerId: string;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsOptional()
  @IsString()
  subCategoryId?: string;

  @IsOptional()
  @IsString()
  weight?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  purchasePrice: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  priceNormal: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  priceCamino: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  priceEspecial: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  priceMayorista?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minQuantityWholesale?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minStock?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  reserveQuantity?: number;

  @IsOptional()
  @IsString()
  additionalInfo?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
