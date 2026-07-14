import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ClientType } from '@prisma/client';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  alias?: string;

  @IsOptional()
  @IsEnum(ClientType)
  type?: ClientType;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  additionalInfo?: string;
}