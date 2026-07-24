jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));

import { ForbiddenException } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsReportsService } from './analytics-reports.service';

describe('AnalyticsReportsService', () => {
  const admin = {
    id: 1,
    role: $Enums.Role.ADMIN,
  };

  it('muestra los trece reportes al ADMIN y oculta costos a otros roles', () => {
    const service = new AnalyticsReportsService({} as unknown as PrismaService);

    expect(service.getCatalog($Enums.Role.ADMIN)).toHaveLength(13);
    expect(
      service
        .getCatalog($Enums.Role.VENDEDOR)
        .some((item) => item.key === 'inventory-valuation'),
    ).toBe(false);
    expect(
      service
        .getCatalog($Enums.Role.COBRADOR)
        .some((item) => item.key === 'estimated-profit'),
    ).toBe(false);
  });

  it('suma el valor del mismo producto entre Central y Depósito', async () => {
    const product = {
      id: 'product_a_12345678',
      name: 'Producto A',
      purchasePrice: 5,
      providerId: 'provider_1',
      categoryId: 'category_1',
      provider: {
        companyName: 'Proveedor Uno',
      },
      category: {
        name: 'Categoría Uno',
      },
    };
    const findMany = jest.fn().mockResolvedValue([
      {
        warehouseId: 'central',
        productId: product.id,
        stock: 10,
        warehouse: {
          id: 'central',
          name: 'Almacén Central',
          code: 'CENTRAL',
        },
        product,
      },
      {
        warehouseId: 'deposit',
        productId: product.id,
        stock: 5,
        warehouse: {
          id: 'deposit',
          name: 'Depósito',
          code: 'DEPOSITO',
        },
        product,
      },
    ]);
    const prisma = {
      warehouseStock: {
        findMany,
      },
    };
    const service = new AnalyticsReportsService(
      prisma as unknown as PrismaService,
    );

    const report = await service.getReport('inventory-valuation', {}, admin);
    const combined = report.sections[report.sections.length - 1].tables[0];

    expect(report.metrics[2].value).toBe(75);
    expect(combined.rows[0].totalStock).toBe(15);
    expect(combined.rows[0].totalValue).toBe(75);
  });

  it('impide consultar la valorización a un VENDEDOR', async () => {
    const service = new AnalyticsReportsService({} as unknown as PrismaService);

    await expect(
      service.getReport(
        'inventory-valuation',
        {},
        {
          id: 2,
          role: $Enums.Role.VENDEDOR,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('filtra cobranzas por fecha de pago e incluye el día final completo', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      payment: {
        findMany,
      },
    };
    const service = new AnalyticsReportsService(
      prisma as unknown as PrismaService,
    );

    await service.getReport(
      'collections',
      {
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
      },
      admin,
    );

    const calls = findMany.mock.calls as unknown[][];
    const request = calls[0][0] as {
      where: {
        receivedAt: {
          gte: Date;
          lte: Date;
        };
      };
    };
    const where = request.where;

    expect(where.receivedAt.gte.toISOString()).toBe('2026-07-01T04:00:00.000Z');
    expect(where.receivedAt.lte.toISOString()).toBe('2026-08-01T03:59:59.999Z');
  });
});
