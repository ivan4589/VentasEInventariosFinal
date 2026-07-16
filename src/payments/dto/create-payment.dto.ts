import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, IsEnum, IsPositive } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @IsUUID()
  @IsNotEmpty()
  saleId: string;

  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}