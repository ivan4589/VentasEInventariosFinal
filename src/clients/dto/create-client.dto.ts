import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { $Enums } from '../../../generated/prisma/client';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsOptional()
  @IsString()
  alias?: string;

  @IsEnum($Enums.ClientType)
  @IsNotEmpty()
  type: $Enums.ClientType;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  additionalInfo?: string;
}