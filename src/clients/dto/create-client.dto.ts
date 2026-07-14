import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ClientType } from '@prisma/client';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsOptional()
  @IsString()
  alias?: string;

  @IsEnum(ClientType)
  @IsNotEmpty()
  type: ClientType;

  @IsUUID()
  @IsNotEmpty()
  locationId: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  additionalInfo?: string;
}