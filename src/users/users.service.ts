import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { $Enums, Prisma } from '../../generated/prisma/client';
import { AdminStepUpService } from '../auth/admin-step-up.service';
import { AdminStepUpDto } from '../auth/dto/admin-step-up.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserResponseDto } from './dto/user-response.dto';

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  requestedRole: true,
  status: true,
  isActive: true,
  emailVerifiedAt: true,
  approvedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  mustChangePassword: true,
  twoFactorEnabled: true,
  twoFactorVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stepUp: AdminStepUpService,
  ) {}

  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      select: userSelect,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    const counts = await this.activeSessionCounts();
    return users.map((user) => this.toResponse(user, counts.get(user.id) ?? 0));
  }

  async findOne(id: number): Promise<UserResponseDto> {
    const user = await this.getUserForAdministration(id);
    const activeSessions = await this.prisma.authSession.count({
      where: {
        userId: id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return this.toResponse(user, activeSessions);
  }

  async create(createUserDto: CreateUserDto, actorId: number) {
    if (!createUserDto.confirmation) {
      throw new BadRequestException(
        'Confirma tu contraseña y código del autenticador para crear usuarios',
      );
    }
    const confirmation = await this.stepUp.verify(
      actorId,
      createUserDto.confirmation,
    );
    const normalizedEmail = createUserDto.email.trim().toLowerCase();
    const normalizedName = createUserDto.name.trim();
    const normalizedPhone = createUserDto.phone?.trim() || null;

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const temporaryPassword = this.createTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    const user = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name: normalizedName,
          phone: normalizedPhone,
          role: createUserDto.role,
          requestedRole: createUserDto.role,
          isActive: true,
          status: $Enums.UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          approvedAt: new Date(),
          approvedById: actorId,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
        },
        select: userSelect,
      });

      await transaction.userAdministrationLog.create({
        data: {
          actorId,
          targetUserId: created.id,
          action: $Enums.UserAdministrationAction.USER_CREATED,
          details: {
            name: created.name,
            email: created.email,
            role: created.role,
            phone: created.phone,
            temporaryPasswordIssued: true,
            mustChangePassword: true,
            reason: confirmation.reason,
          },
        },
      });
      return created;
    });

    return {
      user: this.toResponse(user, 0),
      temporaryPassword,
      message:
        'Usuario creado. Copia la contraseña temporal: solo se mostrará esta vez.',
    };
  }

  async update(
    id: number,
    updateUserDto: UpdateUserDto,
    actorId: number,
  ): Promise<UserResponseDto> {
    const currentUser = await this.getUserForAdministration(id);
    this.assertManageableStatus(currentUser.status);

    const normalizedEmail = updateUserDto.email?.trim().toLowerCase();
    const normalizedName = updateUserDto.name?.trim();
    const normalizedPhone =
      updateUserDto.phone === undefined
        ? undefined
        : updateUserDto.phone.trim() || null;

    if (normalizedEmail && normalizedEmail !== currentUser.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (existingUser && existingUser.id !== id) {
        throw new ConflictException(
          'El correo electrónico ya está registrado por otro usuario',
        );
      }
    }

    const newRole = updateUserDto.role ?? currentUser.role;
    const roleChanged = newRole !== currentUser.role;
    const emailChanged =
      normalizedEmail !== undefined && normalizedEmail !== currentUser.email;
    const sensitiveChange = roleChanged || emailChanged;

    let reason: string | undefined;
    if (sensitiveChange) {
      if (!updateUserDto.confirmation) {
        throw new BadRequestException(
          'Los cambios de rol o correo requieren confirmación reforzada',
        );
      }
      reason = (
        await this.stepUp.verify(actorId, updateUserDto.confirmation)
      ).reason;
    }

    if (
      actorId === id &&
      currentUser.role === $Enums.Role.ADMIN &&
      newRole !== $Enums.Role.ADMIN
    ) {
      throw new BadRequestException(
        'No puedes quitarte tu propio rol de administrador',
      );
    }

    if (
      currentUser.role === $Enums.Role.ADMIN &&
      newRole !== $Enums.Role.ADMIN &&
      currentUser.isActive
    ) {
      await this.ensureAnotherActiveAdministrator(id);
    }

    const user = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id },
        data: {
          ...(normalizedName !== undefined ? { name: normalizedName } : {}),
          ...(normalizedEmail !== undefined
            ? {
                email: normalizedEmail,
                emailVerifiedAt: emailChanged ? new Date() : undefined,
              }
            : {}),
          ...(normalizedPhone !== undefined ? { phone: normalizedPhone } : {}),
          ...(updateUserDto.role !== undefined
            ? { role: updateUserDto.role, requestedRole: updateUserDto.role }
            : {}),
          ...(sensitiveChange
            ? { securityVersion: { increment: 1 } }
            : {}),
        },
        select: userSelect,
      });

      if (sensitiveChange) {
        await this.revokeUserSecurity(
          transaction,
          id,
          roleChanged ? 'ROLE_CHANGED_BY_ADMIN' : 'EMAIL_CHANGED_BY_ADMIN',
        );
      }

      await transaction.userAdministrationLog.create({
        data: {
          actorId,
          targetUserId: id,
          action: roleChanged
            ? $Enums.UserAdministrationAction.ROLE_CHANGED
            : $Enums.UserAdministrationAction.USER_UPDATED,
          details: {
            previous: {
              name: currentUser.name,
              email: currentUser.email,
              phone: currentUser.phone,
              role: currentUser.role,
            },
            current: {
              name: updated.name,
              email: updated.email,
              phone: updated.phone,
              role: updated.role,
            },
            sensitiveChange,
            sessionsRevoked: sensitiveChange,
            ...(reason ? { reason } : {}),
          },
        },
      });
      return updated;
    });

    return this.toResponse(user, 0);
  }

  async updateStatus(
    id: number,
    dto: UpdateUserStatusDto,
    actorId: number,
  ): Promise<UserResponseDto> {
    const confirmation = await this.stepUp.verify(actorId, dto.confirmation);
    const currentUser = await this.getUserForAdministration(id);

    if (actorId === id && !dto.isActive) {
      throw new BadRequestException(
        'No puedes desactivar tu propia cuenta de administrador',
      );
    }

    if (
      currentUser.role === $Enums.Role.ADMIN &&
      currentUser.isActive &&
      !dto.isActive
    ) {
      await this.ensureAnotherActiveAdministrator(id);
    }

    if (
      dto.isActive &&
      [
        $Enums.UserStatus.PENDING_EMAIL_VERIFICATION,
        $Enums.UserStatus.PENDING_ADMIN_APPROVAL,
        $Enums.UserStatus.REJECTED,
      ].some((value) => value === currentUser.status)
    ) {
      throw new BadRequestException(
        'Esta cuenta debe gestionarse desde Solicitudes de acceso',
      );
    }

    const nextStatus = dto.isActive
      ? $Enums.UserStatus.ACTIVE
      : $Enums.UserStatus.DISABLED;

    const user = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id },
        data: {
          isActive: dto.isActive,
          status: nextStatus,
          failedLoginAttempts: 0,
          lockedUntil: null,
          securityVersion: { increment: 1 },
        },
        select: userSelect,
      });

      await this.revokeUserSecurity(
        transaction,
        id,
        dto.isActive ? 'ACCOUNT_ENABLED_BY_ADMIN' : 'ACCOUNT_DISABLED_BY_ADMIN',
      );

      await transaction.userAdministrationLog.create({
        data: {
          actorId,
          targetUserId: id,
          action: $Enums.UserAdministrationAction.STATUS_CHANGED,
          details: {
            previousStatus: currentUser.status,
            currentStatus: nextStatus,
            previousIsActive: currentUser.isActive,
            currentIsActive: dto.isActive,
            sessionsRevoked: true,
            reason: confirmation.reason,
          },
        },
      });
      return updated;
    });

    return this.toResponse(user, 0);
  }

  async resetPassword(
    id: number,
    dto: ResetUserPasswordDto,
    actorId: number,
  ) {
    if (id === actorId) {
      throw new BadRequestException(
        'Cambia tu propia contraseña desde Seguridad de la cuenta',
      );
    }
    const confirmation = await this.stepUp.verify(actorId, dto.confirmation);
    const currentUser = await this.getUserForAdministration(id);
    this.assertManageableStatus(currentUser.status);

    const temporaryPassword = this.createTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id },
        data: {
          password: hashedPassword,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
          status:
            currentUser.status === $Enums.UserStatus.TEMPORARILY_LOCKED
              ? $Enums.UserStatus.ACTIVE
              : currentUser.status,
          securityVersion: { increment: 1 },
        },
      });
      await this.revokeUserSecurity(
        transaction,
        id,
        'TEMPORARY_PASSWORD_ISSUED_BY_ADMIN',
      );
      await transaction.userAdministrationLog.create({
        data: {
          actorId,
          targetUserId: id,
          action: $Enums.UserAdministrationAction.PASSWORD_RESET,
          details: {
            temporaryPasswordIssued: true,
            mustChangePassword: true,
            sessionsRevoked: true,
            reason: confirmation.reason,
          },
        },
      });
    });

    return {
      message:
        'Contraseña temporal generada. Todas las sesiones anteriores fueron cerradas.',
      temporaryPassword,
    };
  }

  async unlock(id: number, dto: AdminStepUpDto, actorId: number) {
    const confirmation = await this.stepUp.verify(actorId, dto);
    const currentUser = await this.getUserForAdministration(id);

    if (
      currentUser.status !== $Enums.UserStatus.TEMPORARILY_LOCKED &&
      !currentUser.lockedUntil &&
      currentUser.failedLoginAttempts === 0
    ) {
      throw new BadRequestException('La cuenta no se encuentra bloqueada');
    }

    const user = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id },
        data: {
          status: currentUser.isActive
            ? $Enums.UserStatus.ACTIVE
            : $Enums.UserStatus.DISABLED,
          failedLoginAttempts: 0,
          lockedUntil: null,
          securityVersion: { increment: 1 },
        },
        select: userSelect,
      });
      await this.revokeUserSecurity(
        transaction,
        id,
        'ACCOUNT_UNLOCKED_BY_ADMIN',
      );
      await transaction.userAdministrationLog.create({
        data: {
          actorId,
          targetUserId: id,
          action: $Enums.UserAdministrationAction.USER_UPDATED,
          details: {
            operation: 'ACCOUNT_UNLOCKED',
            previousFailedLoginAttempts: currentUser.failedLoginAttempts,
            previousLockedUntil: currentUser.lockedUntil,
            reason: confirmation.reason,
          },
        },
      });
      await this.createSecurityAudit(
        transaction,
        $Enums.SecurityAuditAction.ACCOUNT_UNLOCKED,
        actorId,
        id,
        { reason: confirmation.reason, operation: 'ADMIN_UNLOCK' },
      );
      return updated;
    });

    return this.toResponse(user, 0);
  }

  async resetTwoFactor(id: number, dto: AdminStepUpDto, actorId: number) {
    if (id === actorId) {
      throw new BadRequestException(
        'Administra tu propio segundo factor desde Seguridad de la cuenta',
      );
    }
    const confirmation = await this.stepUp.verify(actorId, dto);
    const currentUser = await this.getUserForAdministration(id);
    if (!currentUser.twoFactorEnabled) {
      throw new BadRequestException('El usuario no tiene segundo factor activo');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.twoFactorMethod.deleteMany({ where: { userId: id } });
      await transaction.twoFactorRecoveryCode.deleteMany({
        where: { userId: id },
      });
      await transaction.user.update({
        where: { id },
        data: {
          twoFactorEnabled: false,
          twoFactorVerifiedAt: null,
          securityVersion: { increment: 1 },
        },
      });
      await this.revokeUserSecurity(transaction, id, 'TWO_FACTOR_RESET_BY_ADMIN');
      await transaction.userAdministrationLog.create({
        data: {
          actorId,
          targetUserId: id,
          action: $Enums.UserAdministrationAction.USER_UPDATED,
          details: {
            operation: 'TWO_FACTOR_RESET',
            sessionsRevoked: true,
            reason: confirmation.reason,
          },
        },
      });
      await this.createSecurityAudit(
        transaction,
        $Enums.SecurityAuditAction.TWO_FACTOR_RESET_BY_ADMIN,
        actorId,
        id,
        { reason: confirmation.reason },
      );
    });

    return {
      message:
        'Segundo factor restablecido. El usuario deberá configurarlo en su próximo inicio de sesión.',
    };
  }

  async revokeSessions(id: number, dto: AdminStepUpDto, actorId: number) {
    if (id === actorId) {
      throw new BadRequestException(
        'Cierra tus propias sesiones desde Seguridad de la cuenta',
      );
    }
    const confirmation = await this.stepUp.verify(actorId, dto);
    await this.getUserForAdministration(id);

    const result = await this.prisma.$transaction(async (transaction) => {
      const sessions = await transaction.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokeReason: 'REVOKED_BY_ADMIN',
        },
      });
      await transaction.securityToken.updateMany({
        where: { userId: id, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.user.update({
        where: { id },
        data: { securityVersion: { increment: 1 } },
      });
      await transaction.userAdministrationLog.create({
        data: {
          actorId,
          targetUserId: id,
          action: $Enums.UserAdministrationAction.USER_UPDATED,
          details: {
            operation: 'ALL_SESSIONS_REVOKED',
            revokedSessions: sessions.count,
            reason: confirmation.reason,
          },
        },
      });
      await this.createSecurityAudit(
        transaction,
        $Enums.SecurityAuditAction.ALL_SESSIONS_REVOKED,
        actorId,
        id,
        {
          reason: confirmation.reason,
          revokedSessions: sessions.count,
          operation: 'ADMIN_REVOKE_ALL',
        },
      );
      return sessions.count;
    });

    return {
      message: `Se cerraron ${result} sesiones del usuario`,
      revokedSessions: result,
    };
  }

  async findSessions(id: number) {
    await this.getUserForAdministration(id);
    return this.prisma.authSession.findMany({
      where: {
        userId: id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        deviceName: true,
        lastActivityAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { lastActivityAt: 'desc' },
    });
  }

  async findAuditLog() {
    return this.prisma.userAdministrationLog.findMany({
      take: 200,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: { id: true, name: true, email: true },
        },
        targetUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async findSecurityAuditLog(targetUserId?: number) {
    return this.prisma.securityAuditLog.findMany({
      where: targetUserId ? { targetUserId } : undefined,
      take: 200,
      orderBy: { createdAt: 'desc' },
      include: {
        actorUser: {
          select: { id: true, name: true, email: true },
        },
        targetUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  private async getUserForAdministration(id: number): Promise<SelectedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
    return user;
  }

  private assertManageableStatus(status: $Enums.UserStatus) {
    if (
      [
        $Enums.UserStatus.PENDING_EMAIL_VERIFICATION,
        $Enums.UserStatus.PENDING_ADMIN_APPROVAL,
        $Enums.UserStatus.REJECTED,
      ].some((value) => value === status)
    ) {
      throw new BadRequestException(
        'Esta cuenta debe gestionarse desde Solicitudes de acceso',
      );
    }
  }

  private async ensureAnotherActiveAdministrator(excludedUserId: number) {
    const activeAdministrators = await this.prisma.user.count({
      where: {
        role: $Enums.Role.ADMIN,
        status: $Enums.UserStatus.ACTIVE,
        isActive: true,
        id: { not: excludedUserId },
      },
    });
    if (activeAdministrators === 0) {
      throw new BadRequestException(
        'El sistema debe conservar al menos un administrador activo',
      );
    }
  }

  private async activeSessionCounts() {
    const grouped = await this.prisma.authSession.groupBy({
      by: ['userId'],
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.userId, row._count._all]));
  }

  private toResponse(user: SelectedUser, activeSessions: number) {
    return { ...user, activeSessions };
  }

  private async revokeUserSecurity(
    transaction: Prisma.TransactionClient,
    userId: number,
    reason: string,
  ) {
    await transaction.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    await transaction.securityToken.updateMany({
      where: { userId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createSecurityAudit(
    transaction: Prisma.TransactionClient,
    action: $Enums.SecurityAuditAction,
    actorUserId: number,
    targetUserId: number,
    details: Prisma.InputJsonValue,
  ) {
    await transaction.securityAuditLog.create({
      data: {
        id: randomUUID(),
        actorUserId,
        targetUserId,
        action,
        success: true,
        details,
      },
    });
  }

  private createTemporaryPassword() {
    const groups = [
      'ABCDEFGHJKLMNPQRSTUVWXYZ',
      'abcdefghijkmnopqrstuvwxyz',
      '23456789',
      '!@#$%*-_',
    ];
    const all = groups.join('');
    const password = groups.map((group) => group[randomInt(group.length)]);
    while (password.length < 18) {
      password.push(all[randomInt(all.length)]);
    }
    for (let index = password.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(index + 1);
      [password[index], password[swapIndex]] = [
        password[swapIndex],
        password[index],
      ];
    }
    return password.join('');
  }
}
