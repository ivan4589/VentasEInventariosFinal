import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, IsPositive } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class UpdatePaymentDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}