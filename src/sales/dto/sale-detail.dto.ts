import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { $Enums } from '../../../generated/prisma/client';
import { SaleDetailDto } from './sale-detail.dto';

export class CreateSaleDto {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SaleDetailDto)
  details: SaleDetailDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsEnum($Enums.SaleType)
  saleType: $Enums.SaleType;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialPayment?: number;

  @IsOptional()
  @IsEnum($Enums.PaymentMethod)
  paymentMethod?: $Enums.PaymentMethod;

  @IsOptional()
  @IsString()
  paymentReference?: string;
}