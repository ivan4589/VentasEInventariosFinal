import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { $Enums } from '../../../generated/prisma/client';
import { AdminStepUpDto } from '../../auth/dto/admin-step-up.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEnum($Enums.Role)
  role?: $Enums.Role;

  @IsOptional()
  @ValidateNested()
  @Type(() => AdminStepUpDto)
  confirmation?: AdminStepUpDto;
}
