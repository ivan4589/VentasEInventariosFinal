import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import {
  ApproveRegistrationDto,
  PublicRegisterDto,
  RejectRegistrationDto,
  ResetPasswordDto,
} from './dto/security-auth.dto';
import { createOpaqueToken, hashToken } from './security-crypto';
import { SecurityEmailService } from './security-email.service';

type Role = 'ADMIN' | 'VENDEDOR' | 'COBRADOR';
type UserStatus =
  | 'PENDING_EMAIL_VERIFICATION'
  | 'PENDING_ADMIN_APPROVAL'
  | 'ACTIVE'
  | 'REJECTED'
  | 'TEMPORARILY_LOCKED'
  | 'DISABLED';
type SecurityTokenType =
  | 'EMAIL_VERIFICATION'
  | 'PASSWORD_RESET'
  | 'TWO_FACTOR_CHALLENGE';

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
export class EmailAuthService extends AuthService {
  constructor(
    private readonly database: PrismaService,
    jwtService: JwtService,
    private readonly configuration: ConfigService,
    private readonly securityEmail: SecurityEmailService,
  ) {
    super(database, jwtService, configuration);
  }

  override async register(
    dto: PublicRegisterDto,
    context: RequestContext = {},
  ) {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const existing = await this.findSecurityUserByEmail(email);

    if (existing) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const password = await bcrypt.hash(dto.password, 12);
    const rows = await this.database.$queryRaw<UserRow[]>`
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
    const expiresInMinutes = this.verificationTtlMinutes();
    const token = await this.issueEmailToken(
      user.id,
      'EMAIL_VERIFICATION',
      expiresInMinutes,
    );
    const verificationUrl = `${this.emailFrontendUrl()}/verificar-correo?token=${encodeURIComponent(token)}`;

    await this.auditSecurityEvent(
      'USER_REGISTERED',
      user.id,
      user.id,
      context,
      true,
      { requestedRole: dto.requestedRole },
    );
    await this.auditSecurityEvent(
      'EMAIL_VERIFICATION_REQUESTED',
      user.id,
      user.id,
      context,
      true,
    );

    const delivery = await this.securityEmail.sendVerificationEmail({
      to: email,
      name,
      verificationUrl,
      expiresInMinutes,
    });

    return {
      message: delivery.sent
        ? 'Cuenta creada. Revisa tu correo, verifica la dirección y espera la aprobación del administrador.'
        : 'Cuenta creada, pero no se pudo enviar el correo. Usa la opción de reenviar verificación después de configurar Resend.',
      status: 'PENDING_EMAIL_VERIFICATION',
      emailSent: delivery.sent,
      ...(this.exposeDevelopmentData() && !delivery.sent
        ? {
            verificationToken: token,
            verificationUrl,
            emailError: delivery.error,
          }
        : {}),
    };
  }

  override async resendVerification(emailValue: string) {
    const email = emailValue.trim().toLowerCase();
    const user = await this.findSecurityUserByEmail(email);

    if (user?.status !== 'PENDING_EMAIL_VERIFICATION') {
      return { message: GENERIC_RECOVERY_MESSAGE };
    }

    if (
      await this.tokenCreatedRecently(user.id, 'EMAIL_VERIFICATION', 60)
    ) {
      return {
        message:
          'Ya se envió un correo recientemente. Espera un minuto antes de solicitar otro.',
      };
    }

    await this.revokeSecurityTokens(user.id, 'EMAIL_VERIFICATION');
    const expiresInMinutes = this.verificationTtlMinutes();
    const token = await this.issueEmailToken(
      user.id,
      'EMAIL_VERIFICATION',
      expiresInMinutes,
    );
    const verificationUrl = `${this.emailFrontendUrl()}/verificar-correo?token=${encodeURIComponent(token)}`;

    const delivery = await this.securityEmail.sendVerificationEmail({
      to: user.email,
      name: user.name,
      verificationUrl,
      expiresInMinutes,
    });

    await this.auditSecurityEvent(
      'EMAIL_VERIFICATION_REQUESTED',
      user.id,
      user.id,
      {},
      delivery.sent,
      delivery.error ? { error: delivery.error } : null,
    );

    return {
      message: delivery.sent
        ? GENERIC_RECOVERY_MESSAGE
        : 'La cuenta continúa pendiente, pero no se pudo enviar el correo de verificación.',
      emailSent: delivery.sent,
      ...(this.exposeDevelopmentData() && !delivery.sent
        ? {
            verificationToken: token,
            verificationUrl,
            emailError: delivery.error,
          }
        : {}),
    };
  }

  override async forgotPassword(emailValue: string) {
    const email = emailValue.trim().toLowerCase();
    const user = await this.findSecurityUserByEmail(email);

    if (!user || user.status !== 'ACTIVE' || !user.isActive) {
      return { message: GENERIC_RECOVERY_MESSAGE };
    }

    if (await this.tokenCreatedRecently(user.id, 'PASSWORD_RESET', 60)) {
      return { message: GENERIC_RECOVERY_MESSAGE };
    }

    await this.revokeSecurityTokens(user.id, 'PASSWORD_RESET');
    const expiresInMinutes = this.passwordResetTtlMinutes();
    const token = await this.issueEmailToken(
      user.id,
      'PASSWORD_RESET',
      expiresInMinutes,
    );
    const resetUrl = `${this.emailFrontendUrl()}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
    const delivery = await this.securityEmail.sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      expiresInMinutes,
    });

    await this.auditSecurityEvent(
      'PASSWORD_RESET_REQUESTED',
      user.id,
      user.id,
      {},
      delivery.sent,
      delivery.error ? { error: delivery.error } : null,
    );

    return {
      message: GENERIC_RECOVERY_MESSAGE,
      ...(this.exposeDevelopmentData() && !delivery.sent
        ? { resetToken: token, resetUrl, emailError: delivery.error }
        : {}),
    };
  }

  override async resetPassword(dto: ResetPasswordDto) {
    const tokenUsers = await this.database.$queryRaw<
      Array<{ name: string; email: string }>
    >`
      SELECT u."name", u."email"
      FROM "security_tokens" t
      INNER JOIN "User" u ON u."id" = t."userId"
      WHERE t."tokenHash" = ${hashToken(dto.token)}
        AND t."type" = 'PASSWORD_RESET'::"SecurityTokenType"
      LIMIT 1
    `;

    const result = await super.resetPassword(dto);
    const user = tokenUsers[0];
    if (user) {
      await this.securityEmail.sendPasswordChangedEmail({
        to: user.email,
        name: user.name,
      });
    }
    return result;
  }

  override async approveRegistration(
    userId: number,
    dto: ApproveRegistrationDto,
    administratorId: number,
  ) {
    const user = await this.findSecurityUserById(userId);

    if (!user) throw new NotFoundException('Solicitud no encontrada');
    if (user.status === 'PENDING_EMAIL_VERIFICATION') {
      throw new BadRequestException(
        'El solicitante debe verificar su correo antes de ser aprobado',
      );
    }
    if (user.status !== 'PENDING_ADMIN_APPROVAL') {
      throw new BadRequestException('La solicitud no está lista para aprobación');
    }

    await this.database.$executeRaw`
      UPDATE "User"
      SET "role" = ${dto.role}::"Role", "status" = 'ACTIVE'::"UserStatus",
          "isActive" = true, "approvedAt" = NOW(), "approvedById" = ${administratorId},
          "rejectedAt" = NULL, "rejectionReason" = NULL, "updatedAt" = NOW()
      WHERE "id" = ${userId}
    `;

    await this.auditSecurityEvent(
      'REGISTRATION_APPROVED',
      administratorId,
      userId,
      {},
      true,
      { role: dto.role },
    );

    const delivery = await this.securityEmail.sendApprovalEmail({
      to: user.email,
      name: user.name,
      role: dto.role,
      loginUrl: `${this.emailFrontendUrl()}/login`,
    });

    return {
      message: delivery.sent
        ? 'Solicitud aprobada y correo de confirmación enviado.'
        : 'Solicitud aprobada, pero no se pudo enviar el correo de confirmación.',
      emailSent: delivery.sent,
      ...(this.exposeDevelopmentData() && !delivery.sent
        ? { emailError: delivery.error }
        : {}),
    };
  }

  override async rejectRegistration(
    userId: number,
    dto: RejectRegistrationDto,
    administratorId: number,
  ) {
    const user = await this.findSecurityUserById(userId);
    if (!user) throw new NotFoundException('Solicitud no encontrada');

    const result = await super.rejectRegistration(
      userId,
      dto,
      administratorId,
    );
    const delivery = await this.securityEmail.sendRejectionEmail({
      to: user.email,
      name: user.name,
      reason: dto.reason,
    });

    return {
      ...result,
      message: delivery.sent
        ? 'Solicitud rechazada y correo enviado.'
        : 'Solicitud rechazada, pero no se pudo enviar el correo.',
      emailSent: delivery.sent,
    };
  }

  override async resetTwoFactorByAdmin(
    userId: number,
    administratorId: number,
  ) {
    const user = await this.findSecurityUserById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const result = await super.resetTwoFactorByAdmin(userId, administratorId);
    const delivery = await this.securityEmail.sendTwoFactorResetEmail({
      to: user.email,
      name: user.name,
    });
    return { ...result, emailSent: delivery.sent };
  }

  private async findSecurityUserByEmail(email: string) {
    const rows = await this.database.$queryRaw<UserRow[]>`
      SELECT * FROM "User" WHERE "email" = ${email} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async findSecurityUserById(id: number) {
    const rows = await this.database.$queryRaw<UserRow[]>`
      SELECT * FROM "User" WHERE "id" = ${id} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async issueEmailToken(
    userId: number,
    type: SecurityTokenType,
    expiresInMinutes: number,
  ) {
    const token = createOpaqueToken();
    const expiresAt = new Date(
      Date.now() + expiresInMinutes * 60 * 1000,
    );

    await this.database.$executeRaw`
      INSERT INTO "security_tokens" (
        "id", "userId", "type", "tokenHash", "expiresAt", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${userId}, ${type}::"SecurityTokenType",
        ${hashToken(token)}, ${expiresAt}, NOW()
      )
    `;
    return token;
  }

  private async revokeSecurityTokens(
    userId: number,
    type: SecurityTokenType,
  ) {
    await this.database.$executeRaw`
      UPDATE "security_tokens"
      SET "revokedAt" = NOW()
      WHERE "userId" = ${userId}
        AND "type" = ${type}::"SecurityTokenType"
        AND "usedAt" IS NULL
        AND "revokedAt" IS NULL
    `;
  }

  private async tokenCreatedRecently(
    userId: number,
    type: SecurityTokenType,
    seconds: number,
  ) {
    const rows = await this.database.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(
        SELECT 1
        FROM "security_tokens"
        WHERE "userId" = ${userId}
          AND "type" = ${type}::"SecurityTokenType"
          AND "createdAt" > NOW() - (${seconds} * INTERVAL '1 second')
      ) AS "exists"
    `;
    return rows[0]?.exists ?? false;
  }

  private async auditSecurityEvent(
    action: string,
    actorUserId: number | null,
    targetUserId: number | null,
    context: RequestContext,
    success: boolean,
    details: unknown = null,
  ) {
    await this.database.$executeRaw`
      INSERT INTO "security_audit_logs" (
        "id", "actorUserId", "targetUserId", "action", "success",
        "details", "ipAddress", "userAgent", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${actorUserId}, ${targetUserId},
        ${action}::"SecurityAuditAction", ${success},
        ${details ? JSON.stringify(details) : null}::jsonb,
        ${context.ipAddress || null}, ${context.userAgent || null}, NOW()
      )
    `;
  }

  private verificationTtlMinutes() {
    return this.readTtl('EMAIL_VERIFICATION_TTL_MINUTES', 30);
  }

  private passwordResetTtlMinutes() {
    return this.readTtl('PASSWORD_RESET_TTL_MINUTES', 30);
  }

  private readTtl(key: string, fallback: number) {
    const configured = Number(
      this.configuration.get<string>(key) || fallback,
    );
    if (!Number.isFinite(configured)) return fallback;
    return Math.min(Math.max(Math.trunc(configured), 5), 1440);
  }

  private emailFrontendUrl() {
    const value =
      this.configuration.get<string>('FRONTEND_URL') ||
      'http://localhost:5173';
    return value.replace(/\/+$/, '');
  }

  private exposeDevelopmentData() {
    return this.configuration.get<string>('NODE_ENV') !== 'production';
  }
}
