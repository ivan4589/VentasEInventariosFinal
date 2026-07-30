import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const jwt = {
    signAsync: jest.fn(),
  };
  const config = {
    get: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$executeRaw.mockResolvedValue(1);
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  it('rechaza el inicio de sesión de un usuario inactivo', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        id: 4,
        name: 'Usuario Inactivo',
        email: 'inactivo@prueba.com',
        password: await bcrypt.hash('Segura123!', 12),
        role: 'VENDEDOR',
        requestedRole: 'VENDEDOR',
        status: 'DISABLED',
        isActive: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFactorEnabled: false,
        securityVersion: 1,
      },
    ]);

    await expect(
      service.login({
        email: 'INACTIVO@PRUEBA.COM',
        password: 'Segura123!',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('crea un desafío de segundo factor para una cuenta activa', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        id: 1,
        name: 'Administrador',
        email: 'admin@prueba.com',
        password: await bcrypt.hash('Segura123!', 12),
        role: 'ADMIN',
        requestedRole: null,
        status: 'ACTIVE',
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFactorEnabled: false,
        securityVersion: 1,
      },
    ]);

    const result = await service.login({
      email: 'ADMIN@PRUEBA.COM',
      password: 'Segura123!',
    });

    expect(result).toEqual({
      requiresTwoFactorSetup: true,
      challengeToken: expect.any(String),
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
  });
});
