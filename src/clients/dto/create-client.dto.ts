import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { $Enums } from '../../../generated/prisma/client';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  alias?: string;

  @IsEnum($Enums.ClientType)
  type: $Enums.ClientType;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  whatsappConsent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  additionalInfo?: string;
}
