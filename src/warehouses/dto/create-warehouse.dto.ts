import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message:
      'El código solo puede contener letras, números, guiones y guiones bajos',
  })
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}