import {
  Body,
  Controller,
  Delete,
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
import { AuthSecurityCompletionService } from './auth-security-completion.service';
import { AuthRateLimit } from './decorators/auth-rate-limit.decorator';
import { Roles } from './decorators/roles.decorator';
import {
  ApproveRegistrationDto,
  ChangePasswordDto,
  EmailDto,
  PublicRegisterDto,
  RecoveryCodesRegenerateDto,
  RefreshTokenDto,
  RejectRegistrationDto,
  ResetPasswordDto,
  SecureLoginDto,
  TokenDto,
  TwoFactorCodeDto,
  TwoFactorRecoveryDto,
} from './dto/security-auth.dto';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthService } from './auth.service';

@Controller('auth')
@UseGuards(AuthRateLimitGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly completion: AuthSecurityCompletionService,
  ) {}

  @Post('register')
  @AuthRateLimit({
    limit: 5,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000,
    includeEmail: true,
  })
  register(@Body() dto: PublicRegisterDto, @Req() request: Request) {
    return this.authService.register(dto, this.context(request));
  }

  @Post('verify-email')
  @AuthRateLimit({ limit: 10, windowMs: 15 * 60 * 1000 })
  verifyEmail(@Body() dto: TokenDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @AuthRateLimit({
    limit: 3,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000,
    includeEmail: true,
  })
  resendVerification(@Body() dto: EmailDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Post('login')
  @AuthRateLimit({
    limit: 5,
    windowMs: 60 * 1000,
    blockMs: 15 * 60 * 1000,
    includeEmail: true,
  })
  async login(@Body() dto: SecureLoginDto, @Req() request: Request) {
    await this.completion.prepareLogin(dto.email, this.context(request));
    return this.authService.login(dto, this.context(request));
  }

  @Post('2fa/setup')
  @AuthRateLimit({ limit: 10, windowMs: 5 * 60 * 1000 })
  startTwoFactorSetup(@Body() dto: TokenDto) {
    return this.authService.startTwoFactorSetup(dto.token);
  }

  @Post('2fa/confirm')
  @AuthRateLimit({
    limit: 5,
    windowMs: 5 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  })
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
    return this.completeSession(result, response, dto.remember === true);
  }

  @Post('2fa/verify')
  @AuthRateLimit({
    limit: 5,
    windowMs: 5 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  })
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
    return this.completeSession(result, response, dto.remember === true);
  }

  @Post('2fa/recovery')
  @AuthRateLimit({
    limit: 5,
    windowMs: 5 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  })
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
    return this.completeSession(result, response, dto.remember === true);
  }

  @Post('forgot-password')
  @AuthRateLimit({
    limit: 3,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000,
    includeEmail: true,
  })
  forgotPassword(@Body() dto: EmailDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @AuthRateLimit({ limit: 5, windowMs: 60 * 60 * 1000 })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh')
  @AuthRateLimit({ limit: 30, windowMs: 60 * 1000 })
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
    return this.completeSession(result, response, true);
  }

  @Post('logout')
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = dto.refreshToken || this.readCookie(request, 'refresh_token');
    const result = await this.authService.logout(token);
    this.clearRefreshCookie(response);
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() request: any) {
    return this.completion.getCurrentUser(request.user.id);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  getSessions(@Req() request: any) {
    return this.completion.getSessions(
      request.user.id,
      request.user.sessionId,
    );
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  async revokeSession(
    @Param('id') id: string,
    @Req() request: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.completion.revokeSession(
      request.user.id,
      id,
      request.user.sessionId,
      this.context(request),
    );
    if (result.currentSessionRevoked) this.clearRefreshCookie(response);
    return result;
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @Req() request: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.completion.logoutAll(
      request.user.id,
      this.context(request),
    );
    this.clearRefreshCookie(response);
    return result;
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @AuthRateLimit({ limit: 5, windowMs: 60 * 60 * 1000 })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() request: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.completion.changePassword(
      request.user.id,
      dto,
      this.context(request),
    );
    this.clearRefreshCookie(response);
    return result;
  }

  @Post('2fa/recovery-codes/regenerate')
  @UseGuards(JwtAuthGuard)
  @AuthRateLimit({
    limit: 3,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000,
  })
  regenerateRecoveryCodes(
    @Body() dto: RecoveryCodesRegenerateDto,
    @Req() request: any,
  ) {
    return this.completion.regenerateRecoveryCodes(
      request.user.id,
      dto,
      this.context(request),
    );
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
    remember: boolean,
  ) {
    response.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      ...(remember ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}),
      path: '/api/auth',
    });
    const { refreshToken: _refreshToken, ...publicResult } = result;
    return publicResult;
  }

  private clearRefreshCookie(response: Response) {
    response.clearCookie('refresh_token', { path: '/api/auth' });
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
