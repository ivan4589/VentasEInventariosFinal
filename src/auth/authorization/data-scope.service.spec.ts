import { ForbiddenException } from '@nestjs/common';
import { $Enums } from '../../../generated/prisma/client';
import { DataScopeService } from './data-scope.service';

describe('Gestión compartida de preventas', () => {
  const prisma = { sale: { findUnique: jest.fn() } };
  const service = new DataScopeService(prisma as any);
  beforeEach(() => {
    prisma.sale.findUnique.mockResolvedValue({ id: 'sale', userId: 1 });
  });
  it.each([$Enums.Role.ADMIN, $Enums.Role.VENDEDOR])(
    'permite gestionar preventas ajenas a %s',
    async (role) => {
      await expect(
        service.assertCanManagePresale('sale', { id: 2, role }),
      ).resolves.toBeUndefined();
    },
  );
  it('impide gestionar preventas al cobrador', async () => {
    await expect(
      service.assertCanManagePresale('sale', {
        id: 2,
        role: $Enums.Role.COBRADOR,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('mantiene las devoluciones del vendedor limitadas a sus propias ventas', async () => {
    await expect(
      service.assertCanManageSale('sale', {
        id: 2,
        role: $Enums.Role.VENDEDOR,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertCanManageSale('sale', {
        id: 1,
        role: $Enums.Role.VENDEDOR,
      }),
    ).resolves.toBeUndefined();
  });
});
