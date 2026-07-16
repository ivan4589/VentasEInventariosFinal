import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { $Enums } from '../../../generated/prisma/client';

export class ReportFiltersDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum($Enums.PaymentMethod)
  paymentMethod?: $Enums.PaymentMethod;

  @IsOptional()
  @IsEnum($Enums.SaleStatus)
  status?: $Enums.SaleStatus;

  @IsOptional()
  @IsEnum($Enums.PaymentStatus)
  paymentStatus?: $Enums.PaymentStatus;

  @IsOptional()
  @IsEnum($Enums.ReportType)
  type?: $Enums.ReportType;
}