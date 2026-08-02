import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateProviderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  companyName: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  contactName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;
}
