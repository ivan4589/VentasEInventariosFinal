import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { $Enums } from '../../generated/prisma/client';
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
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<UserResponseDto[]> {
    return this.prisma.user.findMany({
      select: userSelect,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: number): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return user;
  }

  async create(
    createUserDto: CreateUserDto,
    actorId: number,
  ): Promise<UserResponseDto> {
    const normalizedEmail = createUserDto.email.trim().toLowerCase();
    const normalizedName = createUserDto.name.trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const role = createUserDto.role ?? $Enums.Role.VENDEDOR;

    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name: normalizedName,
          role,
        },
        select: userSelect,
      });

      await transaction.userAdministrationLog.create({
        data: {
          actorId,
          targetUserId: user.id,
          action: $Enums.UserAdministrationAction.USER_CREATED,
          details: {
            name: user.name,
            email: user.email,
            role: user.role,
          },
        },
      });

      return user;
    });
  }

  async update(
    id: number,
    updateUserDto: UpdateUserDto,
    actorId: number,
  ): Promise<UserResponseDto> {
    const currentUser = await this.getUserForAdministration(id);
    const normalizedEmail = updateUserDto.email?.trim().toLowerCase();
    const normalizedName = updateUserDto.name?.trim();

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

    const data = {
      ...(normalizedName !== undefined ? { name: normalizedName } : {}),
      ...(normalizedEmail !== undefined ? { email: normalizedEmail } : {}),
      ...(updateUserDto.role !== undefined ? { role: updateUserDto.role } : {}),
    };

    const roleChanged = newRole !== currentUser.role;

    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data,
        select: userSelect,
      });

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
              role: currentUser.role,
            },
            current: {
              name: user.name,
              email: user.email,
              role: user.role,
            },
          },
        },
      });

      return user;
    });
  }

  async updateStatus(
    id: number,
    dto: UpdateUserStatusDto,
    actorId: number,
  ): Promise<UserResponseDto> {
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

    if (currentUser.isActive === dto.isActive) {
      return this.findOne(id);
    }

    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data: { isActive: dto.isActive },
        select: userSelect,
      });

      await transaction.userAdministrationLog.create({
        data: {
          actorId,
          targetUserId: id,
          action: $Enums.UserAdministrationAction.STATUS_CHANGED,
          details: {
            previousStatus: currentUser.isActive ? 'ACTIVE' : 'INACTIVE',
            currentStatus: user.isActive ? 'ACTIVE' : 'INACTIVE',
          },
        },
      });

      return user;
    });
  }

  async resetPassword(
    id: number,
    dto: ResetUserPasswordDto,
    actorId: number,
  ): Promise<{ message: string }> {
    await this.getUserForAdministration(id);
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id },
        data: { password: hashedPassword },
      });

      await transaction.userAdministrationLog.create({
        data: {
          actorId,
          targetUserId: id,
          action: $Enums.UserAdministrationAction.PASSWORD_RESET,
        },
      });
    });

    return {
      message: 'Contraseña restablecida correctamente',
    };
  }

  async findAuditLog() {
    return this.prisma.userAdministrationLog.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        targetUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async remove(id: number, actorId: number): Promise<UserResponseDto> {
    return this.updateStatus(id, { isActive: false }, actorId);
  }

  private async getUserForAdministration(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return user;
  }

  private async ensureAnotherActiveAdministrator(excludedUserId: number) {
    const activeAdministrators = await this.prisma.user.count({
      where: {
        role: $Enums.Role.ADMIN,
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
}
