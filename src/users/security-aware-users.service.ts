import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

type SecurityUserStatus =
  | 'PENDING_EMAIL_VERIFICATION'
  | 'PENDING_ADMIN_APPROVAL'
  | 'ACTIVE'
  | 'REJECTED'
  | 'TEMPORARILY_LOCKED'
  | 'DISABLED';

@Injectable()
export class SecurityAwareUsersService extends UsersService {
  constructor(private readonly database: PrismaService) {
    super(database);
  }

  override async updateStatus(
    id: number,
    dto: UpdateUserStatusDto,
    actorId: number,
  ): Promise<UserResponseDto> {
    const rows = await this.database.$queryRaw<
      Array<{ status: SecurityUserStatus; isActive: boolean }>
    >`
      SELECT "status", "isActive"
      FROM "User"
      WHERE "id" = ${id}
      LIMIT 1
    `;
    const securityUser = rows[0];

    if (dto.isActive && securityUser) {
      if (securityUser.status === 'PENDING_EMAIL_VERIFICATION') {
        throw new BadRequestException(
          'El usuario debe verificar su correo antes de ser aprobado',
        );
      }

      if (securityUser.status === 'PENDING_ADMIN_APPROVAL') {
        throw new BadRequestException(
          'Aprueba esta cuenta desde el módulo Solicitudes de acceso',
        );
      }

      if (securityUser.status === 'REJECTED') {
        throw new BadRequestException(
          'Una solicitud rechazada no puede activarse desde este módulo',
        );
      }
    }

    const user = await super.updateStatus(id, dto, actorId);

    if (!securityUser) {
      return user;
    }

    if (!dto.isActive && securityUser.status === 'ACTIVE') {
      await this.database.$executeRaw`
        UPDATE "User"
        SET "status" = 'DISABLED'::"UserStatus", "updatedAt" = NOW()
        WHERE "id" = ${id}
      `;
    }

    if (
      dto.isActive &&
      ['DISABLED', 'TEMPORARILY_LOCKED'].includes(securityUser.status)
    ) {
      await this.database.$executeRaw`
        UPDATE "User"
        SET "status" = 'ACTIVE'::"UserStatus",
            "failedLoginAttempts" = 0,
            "lockedUntil" = NULL,
            "updatedAt" = NOW()
        WHERE "id" = ${id}
      `;
    }

    return user;
  }
}
