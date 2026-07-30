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
  'Si existe una cuenta pendiente, recibirás instrucciones en tu correo.';

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
    const token = await this.issueEmailVerificationToken(
      user.id,
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

    await this.revokeEmailVerificationTokens(user.id);
    const expiresInMinutes = this.verificationTtlMinutes();
    const token = await this.issueEmailVerificationToken(
      user.id,
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

  override async approveRegistration(
    userId: number,
    dto: ApproveRegistrationDto,
    administratorId: number,
  ) {
    const user = await this.findSecurityUserById(userId);

    if (!user) {
      throw new NotFoundException('Solicitud no encontrada');
    }

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

  private async issueEmailVerificationToken(
    userId: number,
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
        ${randomUUID()}, ${userId}, 'EMAIL_VERIFICATION'::"SecurityTokenType",
        ${hashToken(token)}, ${expiresAt}, NOW()
      )
    `;

    return token;
  }

  private async revokeEmailVerificationTokens(userId: number) {
    await this.database.$executeRaw`
      UPDATE "security_tokens"
      SET "revokedAt" = NOW()
      WHERE "userId" = ${userId}
        AND "type" = 'EMAIL_VERIFICATION'::"SecurityTokenType"
        AND "usedAt" IS NULL
        AND "revokedAt" IS NULL
    `;
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
    const configured = Number(
      this.configuration.get<string>('EMAIL_VERIFICATION_TTL_MINUTES') || 30,
    );

    if (!Number.isFinite(configured)) {
      return 30;
    }

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
