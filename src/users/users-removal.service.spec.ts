import { BadRequestException } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { UsersService } from './users.service';

describe('UsersService safe removal', () => {
  const confirmation = {
    password: 'AdminPassword123!',
    code: '123456',
    reason: 'Cuenta inactiva que ya no debe mostrarse',
  };

  const disabledUser = {
    id: 2,
    name: 'Usuario Inactivo',
    email: 'inactivo@yungasdistribuidora.cc',
    phone: null,
    role: $Enums.Role.VENDEDOR,
    requestedRole: $Enums.Role.VENDEDOR,
    status: $Enums.UserStatus.DISABLED,
    isActive: false,
    emailVerifiedAt: new Date(),
    approvedAt: new Date(),
    rejectedAt: null,
    rejectionReason: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
    twoFactorEnabled: false,
    twoFactorVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  function setup(user = disabledUser) {
    const transaction = {
      user: { update: jest.fn().mockResolvedValue({}) },
      authSession: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      securityToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userAdministrationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      $transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const stepUp = {
      verify: jest.fn().mockResolvedValue({ reason: confirmation.reason }),
    };
    return {
      service: new UsersService(prisma as never, stepUp as never),
      transaction,
      stepUp,
    };
  }

  it('oculta un usuario desactivado y conserva sus relaciones históricas', async () => {
    const { service, transaction, stepUp } = setup();

    const result = await service.remove(2, confirmation, 1);

    expect(stepUp.verify).toHaveBeenCalledWith(1, confirmation);
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: {
        deletedAt: expect.any(Date),
        securityVersion: { increment: 1 },
      },
    });
    expect(transaction.userAdministrationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 1,
        targetUserId: 2,
        action: $Enums.UserAdministrationAction.USER_REMOVED,
      }),
    });
    expect(result.message).toContain('Su historial se conserva');
  });

  it('exige desactivar la cuenta antes de retirarla', async () => {
    const { service } = setup({
      ...disabledUser,
      isActive: true,
      status: $Enums.UserStatus.ACTIVE,
    });

    await expect(service.remove(2, confirmation, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
