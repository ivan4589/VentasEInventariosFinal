import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET no está definido en el archivo .env');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: {
    sub: number;
    sid?: string;
    securityVersion?: number;
  }) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: number;
        name: string;
        email: string;
        role: 'ADMIN' | 'VENDEDOR' | 'COBRADOR';
        isActive: boolean;
        status: string;
        securityVersion: number;
        mustChangePassword: boolean;
      }>
    >`
      SELECT "id", "name", "email", "role", "isActive", "status",
             "securityVersion", "mustChangePassword"
      FROM "User" WHERE "id" = ${payload.sub} LIMIT 1
    `;
    const user = rows[0];

    if (
      !user ||
      !user.isActive ||
      user.status !== 'ACTIVE' ||
      user.securityVersion !== payload.securityVersion
    ) {
      throw new UnauthorizedException('La sesión ya no es válida');
    }

    if (payload.sid) {
      const sessions = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "auth_sessions"
        WHERE "id" = ${payload.sid}
          AND "userId" = ${user.id}
          AND "revokedAt" IS NULL
          AND "expiresAt" > NOW()
        LIMIT 1
      `;
      if (!sessions[0]) {
        throw new UnauthorizedException('La sesión fue cerrada');
      }
    }

    return {
      ...user,
      sessionId: payload.sid,
    };
  }
}
