import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminStepUpDto } from './dto/admin-step-up.dto';
import { decryptSecret, verifyTotp } from './security-crypto';

@Injectable()
export class AdminStepUpService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(administratorId: number, confirmation: AdminStepUpDto) {
    const administrator = await this.prisma.user.findUnique({
      where: { id: administratorId },
      select: {
        id: true,
        password: true,
        role: true,
        status: true,
        isActive: true,
        twoFactorEnabled: true,
        twoFactorMethod: {
          select: {
            encryptedSecret: true,
            isEnabled: true,
          },
        },
      },
    });

    if (
      !administrator ||
      administrator.role !== $Enums.Role.ADMIN ||
      administrator.status !== $Enums.UserStatus.ACTIVE ||
      !administrator.isActive
    ) {
      throw new ForbiddenException(
        'La cuenta administradora no está habilitada para esta operación',
      );
    }

    const passwordMatches = await bcrypt.compare(
      confirmation.password,
      administrator.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'La contraseña del administrador no es correcta',
      );
    }

    if (
      !administrator.twoFactorEnabled ||
      !administrator.twoFactorMethod?.isEnabled
    ) {
      throw new ForbiddenException(
        'Debes configurar el segundo factor antes de realizar acciones sensibles',
      );
    }

    const secret = decryptSecret(
      administrator.twoFactorMethod.encryptedSecret,
      this.encryptionSecret(),
    );

    if (!verifyTotp(secret, confirmation.code)) {
      throw new UnauthorizedException(
        'El código del autenticador no es correcto',
      );
    }

    return {
      administratorId: administrator.id,
      reason: confirmation.reason.trim(),
    };
  }

  private encryptionSecret() {
    const secret = process.env.TWO_FACTOR_ENCRYPTION_KEY;
    if (!secret) {
      throw new Error('TWO_FACTOR_ENCRYPTION_KEY no está configurado');
    }
    return secret;
  }
}
