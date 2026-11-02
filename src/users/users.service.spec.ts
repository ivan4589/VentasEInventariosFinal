import { BadRequestException, ConflictException } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminStepUpService } from '../auth/admin-step-up.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const baseUser = {
    id: 2,
    name: 'Usuario Prueba',
    email: 'usuario@prueba.com',
    password: 'hashed-password',
    role: $Enums.Role.VENDEDOR,
    isActive: true,
    status: $Enums.UserStatus.ACTIVE,
    deletedAt: null,
    lastLoginAt: null,
    createdAt: new Date('2026-07-24T10:00:00.000Z'),
    updatedAt: new Date('2026-07-24T10:00:00.000Z'),
  };

  const prisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    userAdministrationLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
    authSession: { updateMany: jest.fn() },
    securityToken: { updateMany: jest.fn() },
  };

  const confirmation = { password: 'test-password', code: '123456', reason: 'Test administration' };
  const stepUp = { verify: jest.fn().mockResolvedValue({ reason: confirmation.reason }) };

  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof prisma) => unknown) =>
        callback(prisma),
    );
    service = new UsersService(prisma as unknown as PrismaService, stepUp as unknown as AdminStepUpService);
  });

  it('crea un usuario normalizando correo y registra auditoría', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(baseUser);
    prisma.userAdministrationLog.create.mockResolvedValue({});

    const result = await service.create(
      {
        name: '  Usuario Prueba  ',
        email: '  USUARIO@PRUEBA.COM ',
        confirmation,
        role: $Enums.Role.VENDEDOR,
      },
      1,
    );

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Usuario Prueba',
          email: 'usuario@prueba.com',
          role: $Enums.Role.VENDEDOR,
        }),
      }),
    );
    expect(prisma.userAdministrationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 1,
        targetUserId: 2,
        action: $Enums.UserAdministrationAction.USER_CREATED,
      }),
    });
    expect(result.user.email).toBe('usuario@prueba.com');
    expect(stepUp.verify).toHaveBeenCalledWith(1, confirmation);
    expect(result.temporaryPassword).toHaveLength(18);
  });

  it('rechaza correos duplicados', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 10 });

    await expect(
      service.create(
        {
          name: 'Duplicado',
          email: 'usuario@prueba.com',
          role: $Enums.Role.VENDEDOR,
          confirmation,
        },
        1,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('impide que un administrador se quite su propio rol', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      id: 1,
      role: $Enums.Role.ADMIN,
    });

    await expect(
      service.update(1, { role: $Enums.Role.VENDEDOR, confirmation }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('impide desactivar la propia cuenta', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      id: 1,
      role: $Enums.Role.ADMIN,
    });

    await expect(
      service.updateStatus(1, { isActive: false, confirmation }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('impide desactivar al último administrador activo', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      id: 3,
      role: $Enums.Role.ADMIN,
    });
    prisma.user.count.mockResolvedValue(0);

    await expect(
      service.updateStatus(3, { isActive: false, confirmation }, 1),
    ).rejects.toThrow(
      'El sistema debe conservar al menos un administrador activo',
    );
  });

  it('desactiva un usuario conservando su historial', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({
      ...baseUser,
      isActive: false,
    });
    prisma.userAdministrationLog.create.mockResolvedValue({});

    const result = await service.updateStatus(
      baseUser.id,
      { isActive: false, confirmation },
      1,
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: baseUser.id },
        data: expect.objectContaining({ isActive: false, status: $Enums.UserStatus.DISABLED }),
      }),
    );
    expect(result.isActive).toBe(false);
    expect(prisma.userAdministrationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: $Enums.UserAdministrationAction.STATUS_CHANGED,
      }),
    });
  });

  it('restablece la contraseña sin guardarla en auditoría', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue(baseUser);
    prisma.userAdministrationLog.create.mockResolvedValue({});

    const result = await service.resetPassword(baseUser.id, { confirmation }, 1);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: expect.objectContaining({
        password: expect.any(String),
        mustChangePassword: true,
      }),
    });
    expect(prisma.userAdministrationLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 1,
        targetUserId: baseUser.id,
        action: $Enums.UserAdministrationAction.PASSWORD_RESET,
        details: expect.objectContaining({ temporaryPasswordIssued: true, sessionsRevoked: true }),
      },
    });
    expect(result.temporaryPassword).toHaveLength(18);
    expect(prisma.user.update.mock.calls[0][0].data.password).not.toBe(result.temporaryPassword);
    expect(JSON.stringify(prisma.userAdministrationLog.create.mock.calls)).not.toContain(result.temporaryPassword);
    expect(prisma.authSession.updateMany).toHaveBeenCalled();
    expect(prisma.securityToken.updateMany).toHaveBeenCalled();
  });
});
