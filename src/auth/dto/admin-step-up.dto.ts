import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AdminStepUpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'El código del autenticador debe tener 6 dígitos',
  })
  code: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason: string;
}
