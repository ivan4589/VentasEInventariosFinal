import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { $Enums } from '../../generated/prisma/client';
import { Roles } from './decorators/roles.decorator';
import {
  ApproveRegistrationDto,
  EmailDto,
  PublicRegisterDto,
  RefreshTokenDto,
  RejectRegistrationDto,
  ResetPasswordDto,
  SecureLoginDto,
  TokenDto,
  TwoFactorCodeDto,
  TwoFactorRecoveryDto,
} from './dto/security-auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: PublicRegisterDto, @Req() request: Request) {
    return this.authService.register(dto, this.context(request));
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: TokenDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: EmailDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Post('login')
  login(@Body() dto: SecureLoginDto, @Req() request: Request) {
    return this.authService.login(dto, this.context(request));
  }

  @Post('2fa/setup')
  startTwoFactorSetup(@Body() dto: TokenDto) {
    return this.authService.startTwoFactorSetup(dto.token);
  }

  @Post('2fa/confirm')
  async confirmTwoFactor(
    @Body() dto: TwoFactorCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.confirmTwoFactor(
      dto.challengeToken,
      dto.code,
      this.context(request),
    );
    return this.completeSession(result, response);
  }

  @Post('2fa/verify')
  async verifyTwoFactor(
    @Body() dto: TwoFactorCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyTwoFactor(
      dto.challengeToken,
      dto.code,
      this.context(request),
    );
    return this.completeSession(result, response);
  }

  @Post('2fa/recovery')
  async useRecoveryCode(
    @Body() dto: TwoFactorRecoveryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.useRecoveryCode(
      dto.challengeToken,
      dto.recoveryCode,
      this.context(request),
    );
    return this.completeSession(result, response);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: EmailDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = dto.refreshToken || this.readCookie(request, 'refresh_token');
    const result = await this.authService.refresh(
      token || '',
      this.context(request),
    );
    return this.completeSession(result, response);
  }

  @Post('logout')
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = dto.refreshToken || this.readCookie(request, 'refresh_token');
    const result = await this.authService.logout(token);
    response.clearCookie('refresh_token', { path: '/api/auth' });
    return result;
  }

  @Get('admin/registration-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles($Enums.Role.ADMIN)
  getRegistrationRequests() {
    return this.authService.getRegistrationRequests();
  }

  @Patch('admin/registration-requests/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles($Enums.Role.ADMIN)
  approveRegistration(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveRegistrationDto,
    @Req() request: any,
  ) {
    return this.authService.approveRegistration(id, dto, request.user.id);
  }

  @Patch('admin/registration-requests/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles($Enums.Role.ADMIN)
  rejectRegistration(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectRegistrationDto,
    @Req() request: any,
  ) {
    return this.authService.rejectRegistration(id, dto, request.user.id);
  }

  @Post('admin/users/:id/reset-2fa')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles($Enums.Role.ADMIN)
  resetTwoFactor(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: any,
  ) {
    return this.authService.resetTwoFactorByAdmin(id, request.user.id);
  }

  private context(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }

  private completeSession(
    result: {
      access_token: string;
      refreshToken: string;
      user: unknown;
      recoveryCodes?: string[];
    },
    response: Response,
  ) {
    response.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });
    const { refreshToken: _refreshToken, ...publicResult } = result;
    return publicResult;
  }

  private readCookie(request: Request, name: string) {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return undefined;

    for (const item of cookieHeader.split(';')) {
      const [key, ...valueParts] = item.trim().split('=');
      if (key === name) return decodeURIComponent(valueParts.join('='));
    }
    return undefined;
  }
}
