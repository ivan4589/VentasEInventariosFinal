import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApproveRegistrationDto,
  PublicRegisterDto,
  RejectRegistrationDto,
  ResetPasswordDto,
  SecureLoginDto,
} from './dto/security-auth.dto';
import {
  createOpaqueToken,
  createRecoveryCodes,
  createTotpSecret,
  decryptSecret,
  encryptSecret,
  hashToken,
  verifyTotp,
} from './security-crypto';

type Role = 'ADMIN' | 'VENDEDOR' | 'COBRADOR';
type UserStatus =
  | 'PENDING_EMAIL_VERIFICATION'
  | 'PENDING_ADMIN_APPROVAL'
  | 'ACTIVE'
  | 'REJECTED'
  | 'TEMPORARILY_LOCKED'
  | 'DISABLED';

type UserRow = {
  id: number;
  name: string;
  email: string;
  password: string;
  role: Role;
  requestedRole: Role | null;
  status: UserStatus;
  isActive: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  twoFactorEnabled: boolean;
  securityVersion: number;
};

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

const GENERIC_RECOVERY_MESSAGE =
  'Si existe una cuenta asociada, recibirás instrucciones en tu correo.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: PublicRegisterDto, context: RequestContext = {}) {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const existing = await this.findUserByEmail(email);

    if (existing) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const password = await bcrypt.hash(dto.password, 12);
    const rows = await this.prisma.$queryRaw<UserRow[]>`
      INSERT INTO "User" (
        "name", "email", "password", "role", "requestedRole", "phone",
        "isActive", "status", "failedLoginAttempts", "twoFactorEnabled",
        "securityVersion", "createdAt", "updatedAt"
      ) VALUES (
        ${name}, ${email}, ${password}, ${dto.requestedRole}::"Role",
        ${dto.requestedRole}::"Role", ${dto.phone?.trim() || null}, false,
        'PENDING_EMAIL_VERIFICATION'::"UserStatus", 0, false, 1, NOW(), NOW()
      )
      RETURNING *
    `;
    const user = rows[0];
    const token = await this.issueSecurityToken(
      user.id,
      'EMAIL_VERIFICATION',
      15,
    );

    await this.audit('USER_REGISTERED', user.id, user.id, context, true, {
      requestedRole: dto.requestedRole,
    });
    await this.sendEmail(
      email,
      'Verifica tu cuenta',
      `Para verificar tu cuenta ingresa al siguiente enlace: ${this.frontendUrl()}/verificar-correo?token=${encodeURIComponent(token)}`,
    );

    return {
      message:
        'Cuenta creada. Revisa tu correo y luego espera la aprobación del administrador.',
      status: 'PENDING_EMAIL_VERIFICATION',
      ...(this.exposeDevelopmentTokens() ? { verificationToken: token } : {}),
    };
  }

  async verifyEmail(token: string) {
    const record = await this.consumeToken(token, 'EMAIL_VERIFICATION', false);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "User"
        SET "emailVerifiedAt" = NOW(),
            "status" = 'PENDING_ADMIN_APPROVAL'::"UserStatus",
            "updatedAt" = NOW()
        WHERE "id" = ${record.userId}
      `;
      await tx.$executeRaw`
        UPDATE "security_tokens" SET "usedAt" = NOW() WHERE "id" = ${record.id}
      `;
    });

    await this.audit('EMAIL_VERIFIED', record.userId, record.userId, {}, true);
    return {
      message: 'Correo verificado. Tu solicitud espera aprobación administrativa.',
      status: 'PENDING_ADMIN_APPROVAL',
    };
  }

  async resendVerification(emailValue: string) {
    const email = emailValue.trim().toLowerCase();
    const user = await this.findUserByEmail(email);

    if (user?.status === 'PENDING_EMAIL_VERIFICATION') {
      await this.revokeTokens(user.id, 'EMAIL_VERIFICATION');
      const token = await this.issueSecurityToken(
        user.id,
        'EMAIL_VERIFICATION',
        15,
      );
      await this.sendEmail(
        email,
        'Verifica tu cuenta',
        `Verifica tu cuenta desde: ${this.frontendUrl()}/verificar-correo?token=${encodeURIComponent(token)}`,
      );
    }

    return { message: GENERIC_RECOVERY_MESSAGE };
  }

  async login(dto: SecureLoginDto, context: RequestContext = {}) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.findUserByEmail(email);

    if (!user) {
      await this.recordLoginAttempt(null, email, false, 'INVALID_CREDENTIALS', context);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.recordLoginAttempt(user.id, email, false, 'ACCOUNT_LOCKED', context);
      throw new UnauthorizedException('Cuenta bloqueada temporalmente');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      await this.handleFailedLogin(user, context);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive || user.status !== 'ACTIVE') {
      await this.recordLoginAttempt(user.id, email, false, user.status, context);
      if (user.status === 'PENDING_EMAIL_VERIFICATION') {
        throw new ForbiddenException('Debes verificar tu correo electrónico');
      }
      if (user.status === 'PENDING_ADMIN_APPROVAL') {
        throw new ForbiddenException('Tu cuenta espera aprobación del administrador');
      }
      if (user.status === 'REJECTED') {
        throw new ForbiddenException('La solicitud de acceso fue rechazada');
      }
      throw new ForbiddenException('La cuenta no está habilitada');
    }

    await this.prisma.$executeRaw`
      UPDATE "User"
      SET "failedLoginAttempts" = 0, "lockedUntil" = NULL, "updatedAt" = NOW()
      WHERE "id" = ${user.id}
    `;
    await this.recordLoginAttempt(user.id, email, true, null, context);

    const challengeToken = await this.issueSecurityToken(
      user.id,
      'TWO_FACTOR_CHALLENGE',
      5,
    );

    return user.twoFactorEnabled
      ? { requiresTwoFactor: true, challengeToken }
      : { requiresTwoFactorSetup: true, challengeToken };
  }

  async startTwoFactorSetup(challengeToken: string) {
    const challenge = await this.consumeToken(
      challengeToken,
      'TWO_FACTOR_CHALLENGE',
      false,
    );
    const user = await this.findUserById(challenge.userId);
    if (!user) throw new UnauthorizedException('Desafío inválido');

    const secret = createTotpSecret();
    const encryptedSecret = encryptSecret(secret, this.encryptionSecret());

    await this.prisma.$executeRaw`
      INSERT INTO "two_factor_methods" (
        "id", "userId", "encryptedSecret", "isEnabled", "createdAt", "updatedAt"
      ) VALUES (${randomUUID()}, ${user.id}, ${encryptedSecret}, false, NOW(), NOW())
      ON CONFLICT ("userId") DO UPDATE
      SET "encryptedSecret" = EXCLUDED."encryptedSecret",
          "isEnabled" = false,
          "confirmedAt" = NULL,
          "updatedAt" = NOW()
    `;

    const issuer = encodeURIComponent('Yungas Distribuidora');
    const account = encodeURIComponent(user.email);
    return {
      secret,
      otpauthUrl: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&digits=6&period=30`,
    };
  }

  async confirmTwoFactor(
    challengeToken: string,
    code: string,
    context: RequestContext = {},
  ) {
    const challenge = await this.consumeToken(
      challengeToken,
      'TWO_FACTOR_CHALLENGE',
      false,
    );
    const method = await this.getTwoFactorMethod(challenge.userId);
    if (!method) throw new BadRequestException('Primero configura el autenticador');

    const secret = decryptSecret(method.encryptedSecret, this.encryptionSecret());
    if (!verifyTotp(secret, code)) {
      await this.audit('TWO_FACTOR_FAILED', challenge.userId, challenge.userId, context, false);
      throw new UnauthorizedException('Código de autenticación inválido');
    }

    const recoveryCodes = createRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "two_factor_methods"
        SET "isEnabled" = true, "confirmedAt" = NOW(), "lastUsedAt" = NOW(), "updatedAt" = NOW()
        WHERE "userId" = ${challenge.userId}
      `;
      await tx.$executeRaw`
        UPDATE "User"
        SET "twoFactorEnabled" = true, "twoFactorVerifiedAt" = NOW(), "updatedAt" = NOW()
        WHERE "id" = ${challenge.userId}
      `;
      await tx.$executeRaw`
        DELETE FROM "two_factor_recovery_codes" WHERE "userId" = ${challenge.userId}
      `;
      for (const recoveryCode of recoveryCodes) {
        await tx.$executeRaw`
          INSERT INTO "two_factor_recovery_codes" ("id", "userId", "codeHash", "createdAt")
          VALUES (${randomUUID()}, ${challenge.userId}, ${hashToken(recoveryCode)}, NOW())
        `;
      }
      await tx.$executeRaw`
        UPDATE "security_tokens" SET "usedAt" = NOW() WHERE "id" = ${challenge.id}
      `;
    });

    await this.audit('TWO_FACTOR_ENABLED', challenge.userId, challenge.userId, context, true);
    const session = await this.createSession(challenge.userId, context);
    return { ...session, recoveryCodes };
  }

  async verifyTwoFactor(
    challengeToken: string,
    code: string,
    context: RequestContext = {},
  ) {
    const challenge = await this.consumeToken(
      challengeToken,
      'TWO_FACTOR_CHALLENGE',
      false,
    );
    const method = await this.getTwoFactorMethod(challenge.userId);
    if (!method?.isEnabled) {
      throw new UnauthorizedException('Segundo factor no configurado');
    }

    const secret = decryptSecret(method.encryptedSecret, this.encryptionSecret());
    if (!verifyTotp(secret, code)) {
      await this.audit('TWO_FACTOR_FAILED', challenge.userId, challenge.userId, context, false);
      throw new UnauthorizedException('Código de autenticación inválido');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "two_factor_methods" SET "lastUsedAt" = NOW(), "updatedAt" = NOW()
        WHERE "userId" = ${challenge.userId}
      `;
      await tx.$executeRaw`
        UPDATE "security_tokens" SET "usedAt" = NOW() WHERE "id" = ${challenge.id}
      `;
      await tx.$executeRaw`
        UPDATE "User" SET "lastLoginAt" = NOW(), "updatedAt" = NOW()
        WHERE "id" = ${challenge.userId}
      `;
    });

    await this.audit('TWO_FACTOR_VERIFIED', challenge.userId, challenge.userId, context, true);
    return this.createSession(challenge.userId, context);
  }

  async useRecoveryCode(
    challengeToken: string,
    recoveryCode: string,
    context: RequestContext = {},
  ) {
    const challenge = await this.consumeToken(
      challengeToken,
      'TWO_FACTOR_CHALLENGE',
      false,
    );
    const codeHash = hashToken(recoveryCode.trim().toUpperCase());
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "two_factor_recovery_codes"
      WHERE "userId" = ${challenge.userId} AND "codeHash" = ${codeHash} AND "usedAt" IS NULL
      LIMIT 1
    `;
    if (!rows[0]) throw new UnauthorizedException('Código de recuperación inválido');

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "two_factor_recovery_codes" SET "usedAt" = NOW() WHERE "id" = ${rows[0].id}
      `;
      await tx.$executeRaw`
        UPDATE "security_tokens" SET "usedAt" = NOW() WHERE "id" = ${challenge.id}
      `;
    });
    await this.audit(
      'TWO_FACTOR_RECOVERY_CODE_USED',
      challenge.userId,
      challenge.userId,
      context,
      true,
    );
    return this.createSession(challenge.userId, context);
  }

  async forgotPassword(emailValue: string) {
    const email = emailValue.trim().toLowerCase();
    const user = await this.findUserByEmail(email);

    if (user && user.status === 'ACTIVE') {
      await this.revokeTokens(user.id, 'PASSWORD_RESET');
      const token = await this.issueSecurityToken(user.id, 'PASSWORD_RESET', 15);
      await this.sendEmail(
        email,
        'Recupera tu contraseña',
        `Crea una nueva contraseña desde: ${this.frontendUrl()}/restablecer-contrasena?token=${encodeURIComponent(token)}`,
      );
      await this.audit('PASSWORD_RESET_REQUESTED', user.id, user.id, {}, true);
      return {
        message: GENERIC_RECOVERY_MESSAGE,
        ...(this.exposeDevelopmentTokens() ? { resetToken: token } : {}),
      };
    }

    return { message: GENERIC_RECOVERY_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const record = await this.consumeToken(dto.token, 'PASSWORD_RESET', false);
    const password = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "User"
        SET "password" = ${password}, "passwordChangedAt" = NOW(),
            "securityVersion" = "securityVersion" + 1,
            "failedLoginAttempts" = 0, "lockedUntil" = NULL, "updatedAt" = NOW()
        WHERE "id" = ${record.userId}
      `;
      await tx.$executeRaw`
        UPDATE "security_tokens" SET "usedAt" = NOW() WHERE "id" = ${record.id}
      `;
      await tx.$executeRaw`
        UPDATE "auth_sessions"
        SET "revokedAt" = NOW(), "revokeReason" = 'PASSWORD_RESET', "updatedAt" = NOW()
        WHERE "userId" = ${record.userId} AND "revokedAt" IS NULL
      `;
    });

    await this.audit('PASSWORD_RESET_COMPLETED', record.userId, record.userId, {}, true);
    return { message: 'Contraseña actualizada. Inicia sesión nuevamente.' };
  }

  async refresh(refreshToken: string, context: RequestContext = {}) {
    if (!refreshToken) throw new UnauthorizedException('Sesión no disponible');
    const tokenHash = hashToken(refreshToken);
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; userId: number; expiresAt: Date }>
    >`
      SELECT "id", "userId", "expiresAt" FROM "auth_sessions"
      WHERE "refreshTokenHash" = ${tokenHash} AND "revokedAt" IS NULL
      LIMIT 1
    `;
    const session = rows[0];
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('La sesión expiró');
    }

    const user = await this.findUserById(session.userId);
    if (!user || !user.isActive || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('La cuenta no está disponible');
    }

    const newRefreshToken = createOpaqueToken(48);
    await this.prisma.$executeRaw`
      UPDATE "auth_sessions"
      SET "refreshTokenHash" = ${hashToken(newRefreshToken)},
          "lastActivityAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${session.id}
    `;

    return {
      access_token: await this.signAccessToken(user, session.id),
      refreshToken: newRefreshToken,
      user: this.publicUser(user),
    };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.$executeRaw`
        UPDATE "auth_sessions"
        SET "revokedAt" = NOW(), "revokeReason" = 'LOGOUT', "updatedAt" = NOW()
        WHERE "refreshTokenHash" = ${hashToken(refreshToken)} AND "revokedAt" IS NULL
      `;
    }
    return { message: 'Sesión cerrada' };
  }

  async getRegistrationRequests() {
    return this.prisma.$queryRaw`
      SELECT "id", "name", "email", "phone", "requestedRole", "status",
             "emailVerifiedAt", "createdAt"
      FROM "User"
      WHERE "status" IN (
        'PENDING_EMAIL_VERIFICATION'::"UserStatus",
        'PENDING_ADMIN_APPROVAL'::"UserStatus"
      )
      ORDER BY "createdAt" ASC
    `;
  }

  async approveRegistration(
    userId: number,
    dto: ApproveRegistrationDto,
    administratorId: number,
  ) {
    const user = await this.findUserById(userId);
    if (!user) throw new NotFoundException('Solicitud no encontrada');
    if (user.status !== 'PENDING_ADMIN_APPROVAL') {
      throw new BadRequestException('La solicitud no está lista para aprobación');
    }

    await this.prisma.$executeRaw`
      UPDATE "User"
      SET "role" = ${dto.role}::"Role", "status" = 'ACTIVE'::"UserStatus",
          "isActive" = true, "approvedAt" = NOW(), "approvedById" = ${administratorId},
          "rejectedAt" = NULL, "rejectionReason" = NULL, "updatedAt" = NOW()
      WHERE "id" = ${userId}
    `;
    await this.audit('REGISTRATION_APPROVED', administratorId, userId, {}, true, {
      role: dto.role,
    });
    await this.sendEmail(
      user.email,
      'Cuenta aprobada',
      'Tu cuenta fue aprobada. Ya puedes iniciar sesión y configurar el segundo factor.',
    );
    return { message: 'Solicitud aprobada correctamente' };
  }

  async rejectRegistration(
    userId: number,
    dto: RejectRegistrationDto,
    administratorId: number,
  ) {
    const user = await this.findUserById(userId);
    if (!user) throw new NotFoundException('Solicitud no encontrada');
    if (
      !['PENDING_EMAIL_VERIFICATION', 'PENDING_ADMIN_APPROVAL'].includes(
        user.status,
      )
    ) {
      throw new BadRequestException('La solicitud ya fue procesada');
    }

    await this.prisma.$executeRaw`
      UPDATE "User"
      SET "status" = 'REJECTED'::"UserStatus", "isActive" = false,
          "rejectedAt" = NOW(), "rejectionReason" = ${dto.reason}, "updatedAt" = NOW()
      WHERE "id" = ${userId}
    `;
    await this.audit('REGISTRATION_REJECTED', administratorId, userId, {}, true, {
      reason: dto.reason,
    });
    return { message: 'Solicitud rechazada' };
  }

  async resetTwoFactorByAdmin(userId: number, administratorId: number) {
    const user = await this.findUserById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM "two_factor_methods" WHERE "userId" = ${userId}`;
      await tx.$executeRaw`DELETE FROM "two_factor_recovery_codes" WHERE "userId" = ${userId}`;
      await tx.$executeRaw`
        UPDATE "User"
        SET "twoFactorEnabled" = false, "twoFactorVerifiedAt" = NULL,
            "securityVersion" = "securityVersion" + 1, "updatedAt" = NOW()
        WHERE "id" = ${userId}
      `;
      await tx.$executeRaw`
        UPDATE "auth_sessions"
        SET "revokedAt" = NOW(), "revokeReason" = 'TWO_FACTOR_RESET', "updatedAt" = NOW()
        WHERE "userId" = ${userId} AND "revokedAt" IS NULL
      `;
    });
    await this.audit('TWO_FACTOR_RESET_BY_ADMIN', administratorId, userId, {}, true);
    return { message: 'Segundo factor restablecido' };
  }

  private async createSession(userId: number, context: RequestContext) {
    const user = await this.findUserById(userId);
    if (!user) throw new UnauthorizedException('Usuario no disponible');

    const sessionId = randomUUID();
    const refreshToken = createOpaqueToken(48);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.$executeRaw`
      INSERT INTO "auth_sessions" (
        "id", "userId", "refreshTokenHash", "ipAddress", "userAgent",
        "lastActivityAt", "expiresAt", "createdAt", "updatedAt"
      ) VALUES (
        ${sessionId}, ${user.id}, ${hashToken(refreshToken)},
        ${context.ipAddress || null}, ${context.userAgent || null},
        NOW(), ${expiresAt}, NOW(), NOW()
      )
    `;
    await this.audit('SESSION_CREATED', user.id, user.id, context, true, null, sessionId);

    return {
      access_token: await this.signAccessToken(user, sessionId),
      refreshToken,
      user: this.publicUser(user),
    };
  }

  private async signAccessToken(user: UserRow, sessionId: string) {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        sid: sessionId,
        name: user.name,
        email: user.email,
        role: user.role,
        securityVersion: user.securityVersion,
      },
      { expiresIn: '15m' },
    );
  }

  private publicUser(user: UserRow) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      twoFactorEnabled: user.twoFactorEnabled,
    };
  }

  private async findUserByEmail(email: string) {
    const rows = await this.prisma.$queryRaw<UserRow[]>`
      SELECT * FROM "User" WHERE "email" = ${email} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async findUserById(id: number) {
    const rows = await this.prisma.$queryRaw<UserRow[]>`
      SELECT * FROM "User" WHERE "id" = ${id} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async issueSecurityToken(
    userId: number,
    type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'TWO_FACTOR_CHALLENGE',
    minutes: number,
  ) {
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
    await this.prisma.$executeRaw`
      INSERT INTO "security_tokens" (
        "id", "userId", "type", "tokenHash", "expiresAt", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${userId}, ${type}::"SecurityTokenType",
        ${hashToken(token)}, ${expiresAt}, NOW()
      )
    `;
    return token;
  }

  private async consumeToken(
    token: string,
    type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'TWO_FACTOR_CHALLENGE',
    markUsed = true,
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; userId: number; expiresAt: Date }>
    >`
      SELECT "id", "userId", "expiresAt" FROM "security_tokens"
      WHERE "tokenHash" = ${hashToken(token)}
        AND "type" = ${type}::"SecurityTokenType"
        AND "usedAt" IS NULL AND "revokedAt" IS NULL
      LIMIT 1
    `;
    const record = rows[0];
    if (!record || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('El enlace o código expiró o ya fue utilizado');
    }
    if (markUsed) {
      await this.prisma.$executeRaw`
        UPDATE "security_tokens" SET "usedAt" = NOW() WHERE "id" = ${record.id}
      `;
    }
    return record;
  }

  private async revokeTokens(userId: number, type: string) {
    await this.prisma.$executeRaw`
      UPDATE "security_tokens" SET "revokedAt" = NOW()
      WHERE "userId" = ${userId}
        AND "type" = ${type}::"SecurityTokenType"
        AND "usedAt" IS NULL AND "revokedAt" IS NULL
    `;
  }

  private async getTwoFactorMethod(userId: number) {
    const rows = await this.prisma.$queryRaw<
      Array<{ encryptedSecret: string; isEnabled: boolean }>
    >`
      SELECT "encryptedSecret", "isEnabled" FROM "two_factor_methods"
      WHERE "userId" = ${userId} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async handleFailedLogin(user: UserRow, context: RequestContext) {
    const attempts = user.failedLoginAttempts + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await this.prisma.$executeRaw`
      UPDATE "User"
      SET "failedLoginAttempts" = ${attempts},
          "lockedUntil" = ${lockedUntil},
          "status" = CASE
            WHEN ${attempts} >= 5 THEN 'TEMPORARILY_LOCKED'::"UserStatus"
            ELSE "status"
          END,
          "updatedAt" = NOW()
      WHERE "id" = ${user.id}
    `;
    await this.recordLoginAttempt(
      user.id,
      user.email,
      false,
      lockedUntil ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
      context,
    );
    if (lockedUntil) {
      await this.audit('ACCOUNT_LOCKED', user.id, user.id, context, true, {
        lockedUntil: lockedUntil.toISOString(),
      });
    }
  }

  private async recordLoginAttempt(
    userId: number | null,
    email: string,
    successful: boolean,
    failureReason: string | null,
    context: RequestContext,
  ) {
    await this.prisma.$executeRaw`
      INSERT INTO "login_attempts" (
        "id", "userId", "email", "successful", "failureReason",
        "ipAddress", "userAgent", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${userId}, ${email}, ${successful}, ${failureReason},
        ${context.ipAddress || null}, ${context.userAgent || null}, NOW()
      )
    `;
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

  private async sendEmail(to: string, subject: string, text: string) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error('RESEND_API_KEY no está configurado');
      }
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:
          this.config.get<string>('EMAIL_FROM') ||
          'Yungas Distribuidora <onboarding@resend.dev>',
        to: [to],
        subject,
        text,
      }),
    });
    if (!response.ok) throw new Error('No se pudo enviar el correo de seguridad');
  }

  private frontendUrl() {
    return this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';
  }

  private encryptionSecret() {
    const secret = this.config.get<string>('TWO_FACTOR_ENCRYPTION_KEY');
    if (!secret) throw new Error('TWO_FACTOR_ENCRYPTION_KEY no está configurado');
    return secret;
  }

  private exposeDevelopmentTokens() {
    return (
      this.config.get<string>('NODE_ENV') !== 'production' &&
      !this.config.get<string>('RESEND_API_KEY')
    );
  }
}
