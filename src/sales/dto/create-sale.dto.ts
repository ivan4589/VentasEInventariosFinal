import { IsNotEmpty, IsOptional, IsString, IsUUID, IsArray, ValidateNested, IsEnum, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { SaleDetailDto } from './sale-detail.dto';
import { PaymentStatus } from '@prisma/client';

export class CreateSaleDto {
  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleDetailDto)
  details: SaleDetailDto[];

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsEnum(PaymentStatus)
  @IsNotEmpty()
  paymentStatus: PaymentStatus; // PAID o PENDING (por cobrar)
}