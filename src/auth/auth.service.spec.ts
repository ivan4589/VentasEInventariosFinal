import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const jwt = {
    sign: jest.fn().mockReturnValue('signed-token'),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
    );
  });

  it('rechaza el inicio de sesión de un usuario inactivo', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 4,
      name: 'Usuario Inactivo',
      email: 'inactivo@prueba.com',
      password: await bcrypt.hash('Segura123', 10),
      role: 'VENDEDOR',
      isActive: false,
    });

    await expect(
      service.validateUser('INACTIVO@PRUEBA.COM', 'Segura123'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('registra el último acceso e incluye nombre y rol en el token', async () => {
    prisma.user.update.mockResolvedValue({});

    const result = await service.login({
      id: 1,
      name: 'Administrador',
      email: 'admin@prueba.com',
      role: 'ADMIN',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(jwt.sign).toHaveBeenCalledWith({
      sub: 1,
      name: 'Administrador',
      email: 'admin@prueba.com',
      role: 'ADMIN',
    });
    expect(result).toEqual({ access_token: 'signed-token' });
  });
});
