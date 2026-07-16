import { IsOptional, IsDateString, IsUUID, IsEnum } from 'class-validator';
import { ClientType } from '@prisma/client';

export class DashboardFiltersDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;

  @IsOptional()
  @IsUUID()
  productId?: string;
}