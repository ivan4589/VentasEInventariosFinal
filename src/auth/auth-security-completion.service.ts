import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangePasswordDto,
  RecoveryCodesRegenerateDto,
} from './dto/security-auth.dto';
import {
  createRecoveryCodes,
  decryptSecret,
  hashToken,
  verifyTotp,
} from './security-crypto';
import { SecurityEmailService } from './security-email.service';

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type SessionRow = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
  lastActivityAt: Date;
  expiresAt: Date;
  createdAt: Date;
};

@Injectable()
export class AuthSecurityCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEmail: SecurityEmailService,
  ) {}

  async prepareLogin(emailValue: string, context: RequestContext = {}) {
    const email = emailValue.trim().toLowerCase();
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: number;
        status: string;
        lockedUntil: Date | null;
      }>
    >`
      SELECT "id", "status", "lockedUntil"
      FROM "User"
      WHERE "email" = ${email}
      LIMIT 1
    `;
    const user = rows[0];

    if (
      user?.status === 'TEMPORARILY_LOCKED' &&
      user.lockedUntil &&
      user.lockedUntil.getTime() <= Date.now()
    ) {
      await this.prisma.$executeRaw`
        UPDATE "User"
        SET "status" = 'ACTIVE'::"UserStatus",
            "failedLoginAttempts" = 0,
            "lockedUntil" = NULL,
            "updatedAt" = NOW()
        WHERE "id" = ${user.id}
      `;
      await this.audit('ACCOUNT_UNLOCKED', user.id, user.id, context, true);
    }
  }

  async getCurrentUser(userId: number) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: number;
        name: string;
        email: string;
        role: string;
        status: string;
        isActive: boolean;
        twoFactorEnabled: boolean;
        emailVerifiedAt: Date | null;
        lastLoginAt: Date | null;
      }>
    >`
      SELECT "id", "name", "email", "role", "status", "isActive",
             "twoFactorEnabled", "emailVerifiedAt", "lastLoginAt"
      FROM "User"
      WHERE "id" = ${userId}
      LIMIT 1
    `;

    const user = rows[0];
    if (!user || !user.isActive || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('La cuenta no está disponible');
    }
    return user;
  }

  async getSessions(userId: number, currentSessionId?: string) {
    const rows = await this.prisma.$queryRaw<SessionRow[]>`
      SELECT "id", "ipAddress", "userAgent", "deviceName",
             "lastActivityAt", "expiresAt", "createdAt"
      FROM "auth_sessions"
      WHERE "userId" = ${userId}
        AND "revokedAt" IS NULL
        AND "expiresAt" > NOW()
      ORDER BY "lastActivityAt" DESC
    `;

    return rows.map((session) => ({
      ...session,
      deviceName:
        session.deviceName || this.deviceNameFromUserAgent(session.userAgent),
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(
    userId: number,
    sessionId: string,
    currentSessionId: string | undefined,
    context: RequestContext = {},
  ) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "auth_sessions"
      SET "revokedAt" = NOW(),
          "revokeReason" = 'USER_REVOKED_SESSION',
          "updatedAt" = NOW()
      WHERE "id" = ${sessionId}
        AND "userId" = ${userId}
        AND "revokedAt" IS NULL
      RETURNING "id"
    `;

    if (!rows[0]) {
      throw new NotFoundException('La sesión no existe o ya fue cerrada');
    }

    await this.audit(
      'SESSION_REVOKED',
      userId,
      userId,
      context,
      true,
      { revokedSessionId: sessionId },
      sessionId,
    );

    return {
      message: 'Sesión cerrada correctamente',
      currentSessionRevoked: sessionId === currentSessionId,
    };
  }

  async logoutAll(userId: number, context: RequestContext = {}) {
    await this.prisma.$executeRaw`
      UPDATE "auth_sessions"
      SET "revokedAt" = NOW(),
          "revokeReason" = 'LOGOUT_ALL',
          "updatedAt" = NOW()
      WHERE "userId" = ${userId}
        AND "revokedAt" IS NULL
    `;

    await this.audit('ALL_SESSIONS_REVOKED', userId, userId, context, true);
    return { message: 'Todas las sesiones fueron cerradas' };
  }

  async changePassword(
    userId: number,
    dto: ChangePasswordDto,
    context: RequestContext = {},
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: number; name: string; email: string; password: string }>
    >`
      SELECT "id", "name", "email", "password"
      FROM "User"
      WHERE "id" = ${userId}
      LIMIT 1
    `;
    const user = rows[0];
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const currentMatches = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );
    if (!currentMatches) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }

    const samePassword = await bcrypt.compare(dto.newPassword, user.password);
    if (samePassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente de la actual',
      );
    }

    const password = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "User"
        SET "password" = ${password},
            "passwordChangedAt" = NOW(),
            "securityVersion" = "securityVersion" + 1,
            "failedLoginAttempts" = 0,
            "lockedUntil" = NULL,
            "updatedAt" = NOW()
        WHERE "id" = ${userId}
      `;
      await tx.$executeRaw`
        UPDATE "auth_sessions"
        SET "revokedAt" = NOW(),
            "revokeReason" = 'PASSWORD_CHANGED',
            "updatedAt" = NOW()
        WHERE "userId" = ${userId}
          AND "revokedAt" IS NULL
      `;
      await tx.$executeRaw`
        UPDATE "security_tokens"
        SET "revokedAt" = NOW()
        WHERE "userId" = ${userId}
          AND "usedAt" IS NULL
          AND "revokedAt" IS NULL
      `;
    });

    await this.audit('PASSWORD_CHANGED', userId, userId, context, true);
    await this.securityEmail.sendPasswordChangedEmail({
      to: user.email,
      name: user.name,
    });

    return {
      message:
        'Contraseña cambiada. Por seguridad, todas las sesiones fueron cerradas.',
    };
  }

  async regenerateRecoveryCodes(
    userId: number,
    dto: RecoveryCodesRegenerateDto,
    context: RequestContext = {},
  ) {
    const users = await this.prisma.$queryRaw<
      Array<{
        password: string;
        twoFactorEnabled: boolean;
      }>
    >`
      SELECT "password", "twoFactorEnabled"
      FROM "User"
      WHERE "id" = ${userId}
      LIMIT 1
    `;
    const user = users[0];
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('El segundo factor no está configurado');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('La contraseña no es correcta');
    }

    const methods = await this.prisma.$queryRaw<
      Array<{ encryptedSecret: string; isEnabled: boolean }>
    >`
      SELECT "encryptedSecret", "isEnabled"
      FROM "two_factor_methods"
      WHERE "userId" = ${userId}
      LIMIT 1
    `;
    const method = methods[0];
    if (!method?.isEnabled) {
      throw new BadRequestException('El segundo factor no está configurado');
    }

    const secret = decryptSecret(method.encryptedSecret, this.encryptionSecret());
    if (!verifyTotp(secret, dto.code)) {
      throw new UnauthorizedException('Código de autenticación inválido');
    }

    const recoveryCodes = createRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM "two_factor_recovery_codes"
        WHERE "userId" = ${userId}
      `;
      for (const recoveryCode of recoveryCodes) {
        await tx.$executeRaw`
          INSERT INTO "two_factor_recovery_codes"
            ("id", "userId", "codeHash", "createdAt")
          VALUES
            (${randomUUID()}, ${userId}, ${hashToken(recoveryCode)}, NOW())
        `;
      }
    });

    await this.audit(
      'TWO_FACTOR_VERIFIED',
      userId,
      userId,
      context,
      true,
      { operation: 'RECOVERY_CODES_REGENERATED' },
    );

    return {
      message: 'Códigos de recuperación regenerados',
      recoveryCodes,
    };
  }

  private deviceNameFromUserAgent(userAgent: string | null) {
    if (!userAgent) return 'Dispositivo desconocido';
    const browser = userAgent.includes('Edg/')
      ? 'Microsoft Edge'
      : userAgent.includes('Chrome/')
        ? 'Google Chrome'
        : userAgent.includes('Firefox/')
          ? 'Mozilla Firefox'
          : userAgent.includes('Safari/')
            ? 'Safari'
            : 'Navegador';
    const system = userAgent.includes('Windows')
      ? 'Windows'
      : userAgent.includes('Android')
        ? 'Android'
        : userAgent.includes('iPhone') || userAgent.includes('iPad')
          ? 'iOS'
          : userAgent.includes('Linux')
            ? 'Linux'
            : 'Sistema desconocido';
    return `${browser} en ${system}`;
  }

  private encryptionSecret() {
    const secret = process.env.TWO_FACTOR_ENCRYPTION_KEY;
    if (!secret) {
      throw new Error('TWO_FACTOR_ENCRYPTION_KEY no está configurado');
    }
    return secret;
  }

  private async audit(
    action: string,
    actorUserId: number | null,
    targetUserId: number | null,
    context: RequestContext,
    success: boolean,
    details: unknown = null,
    sessionId: string | null = null,
  ) {
    await this.prisma.$executeRaw`
      INSERT INTO "security_audit_logs" (
        "id", "actorUserId", "targetUserId", "sessionId", "action",
        "success", "details", "ipAddress", "userAgent", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${actorUserId}, ${targetUserId}, ${sessionId},
        ${action}::"SecurityAuditAction", ${success},
        ${details ? JSON.stringify(details) : null}::jsonb,
        ${context.ipAddress || null}, ${context.userAgent || null}, NOW()
      )
    `;
  }
}
