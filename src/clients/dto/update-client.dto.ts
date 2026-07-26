import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { $Enums } from '../../../generated/prisma/client';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  alias?: string;

  @IsOptional()
  @IsEnum($Enums.ClientType)
  type?: $Enums.ClientType;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  whatsappConsent?: boolean;

  @IsOptional()
  @IsString()
  additionalInfo?: string;
}
