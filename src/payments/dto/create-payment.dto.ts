import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { $Enums } from '../../../generated/prisma/client';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  saleId: string;

  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsEnum($Enums.PaymentMethod)
  @IsNotEmpty()
  method: $Enums.PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}