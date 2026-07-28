import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;

export class PublicRegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(160)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsIn(['VENDEDOR', 'COBRADOR'])
  requestedRole: 'VENDEDOR' | 'COBRADOR';

  @IsString()
  @Matches(strongPassword, {
    message:
      'La contraseña debe tener entre 12 y 128 caracteres e incluir mayúscula, minúscula, número y símbolo',
  })
  password: string;
}

export class SecureLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class TokenDto {
  @IsString()
  @MinLength(20)
  token: string;
}

export class EmailDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @Matches(strongPassword, {
    message:
      'La contraseña debe tener entre 12 y 128 caracteres e incluir mayúscula, minúscula, número y símbolo',
  })
  newPassword: string;
}

export class TwoFactorCodeDto {
  @IsString()
  @MinLength(20)
  challengeToken: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código debe contener 6 dígitos' })
  code: string;
}

export class TwoFactorRecoveryDto {
  @IsString()
  @MinLength(20)
  challengeToken: string;

  @IsString()
  @MinLength(8)
  recoveryCode: string;
}

export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ApproveRegistrationDto {
  @IsIn(['VENDEDOR', 'COBRADOR'])
  role: 'VENDEDOR' | 'COBRADOR';
}

export class RejectRegistrationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
