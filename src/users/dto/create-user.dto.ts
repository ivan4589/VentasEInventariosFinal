import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { $Enums } from '../../../generated/prisma/client';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsEnum($Enums.Role)
  role?: $Enums.Role;
}