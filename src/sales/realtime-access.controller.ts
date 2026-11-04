import { Controller, Get, Request, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

/**
 * Supabase Realtime does not accept the NestJS access token (different issuer
 * and signing key). This endpoint exchanges a validated NestJS session for a
 * short-lived JWT that can ONLY pass the listening policies of realtime.messages.
 *
 * Required: SUPABASE_REALTIME_JWT_SECRET (Supabase project legacy HS256 JWT
 * secret, server side only). If that signing method is unavailable for this
 * Supabase project, do NOT expose a fallback public topic. Replace this token
 * issuer with the project's supported signing-key flow instead.
 */
@Controller('realtime')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RealtimeAccessController {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  @Get('access')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_VIEW_ALL)
  access(@Request() req: any) {
    const secret = this.config.get<string>('SUPABASE_REALTIME_JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException('Realtime no esta habilitado en este entorno');
    }
    // A Realtime JWT is read-only: RLS grants SELECT on realtime.messages,
    // not INSERT, and the client must still use NestJS for all business APIs.
    const token = this.jwt.sign(
      {
        sub: String(req.user.id),
        role: 'authenticated',
        yungas_user_id: String(req.user.id),
        yungas_security_version: String(req.user.securityVersion),
        ...(req.user.sessionId ? { yungas_session_id: req.user.sessionId } : {}),
      },
      {
        secret,
        algorithm: 'HS256',
        audience: 'authenticated',
        expiresIn: '5m',
      },
    );
    return {
      accessToken: token,
      expiresInSeconds: 300,
      channels: ['yungas:delivery', 'yungas:inventory'],
      private: true,
    };
  }
}
