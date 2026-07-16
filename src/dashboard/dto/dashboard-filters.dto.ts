import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { $Enums } from '../../../generated/prisma/client';

export class DashboardFiltersDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum($Enums.ClientType)
  clientType?: $Enums.ClientType;

  @IsOptional()
  @IsString()
  productId?: string;
}