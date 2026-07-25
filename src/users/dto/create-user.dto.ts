import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { $Enums } from '../../../generated/prisma/client';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(160)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsOptional()
  @IsEnum($Enums.Role)
  role?: $Enums.Role;
}
