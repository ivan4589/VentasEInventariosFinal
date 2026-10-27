import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateClientContactDto {
  @IsString() @IsNotEmpty() @MaxLength(160)
  name: string;

  @IsOptional() @IsString() @MaxLength(100)
  relationship?: string;

  @IsString() @Matches(/^(?:\+?591)?[ -]?(?:\d[ -]?){8}$/)
  phone: string;

  @IsOptional() @IsBoolean()
  whatsappConsent?: boolean;

  @IsOptional() @IsBoolean()
  isDefault?: boolean;
}
export class UpdateClientContactDto extends PartialType(CreateClientContactDto) {
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
