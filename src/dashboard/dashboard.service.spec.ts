import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    sale: {
      aggregate: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
    payment: {
      aggregate: jest.Mock;
    };
    warehouse: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      sale: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
      payment: {
        aggregate: jest.fn(),
      },
      warehouse: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    service = new DashboardService(prisma as unknown as PrismaService);
  });

  it('calcula el resumen operativo con stock real por almacén', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    prisma.sale.aggregate
      .mockResolvedValueOnce({ _sum: { total: 120 } })
      .mockResolvedValueOnce({ _sum: { total: 900 } });
    prisma.sale.findMany.mockResolvedValue([
      {
        total: 200,
        dueDate: yesterday,
        payments: [{ amount: 100 }],
      },
      {
        total: 50,
        dueDate: null,
        payments: [],
      },
    ]);
    prisma.sale.groupBy.mockResolvedValue([
      { clientId: 'client-1' },
      { clientId: 'client-2' },
    ]);
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 80 } });
    prisma.warehouse.findMany.mockResolvedValue([
      {
        id: 'central',
        name: 'Almacén Central',
        code: 'CENTRAL',
        isDefault: true,
        stocks: [
          { stock: 10, reservedStock: 2, minStock: 2 },
          { stock: 1, reservedStock: 0, minStock: 2 },
        ],
      },
      {
        id: 'deposito',
        name: 'Depósito',
        code: 'DEPOSITO',
        isDefault: false,
        stocks: [{ stock: 4, reservedStock: 0, minStock: 0 }],
      },
    ]);

    const result = await service.getOverview();

    expect(result).toEqual(
      expect.objectContaining({
        salesToday: 120,
        salesMonth: 900,
        collectionToday: 80,
        totalDebt: 150,
        overdueAccounts: 1,
        activeClients: 2,
        stockAlerts: 1,
        totalStock: 15,
        availableStock: 13,
      }),
    );
    expect(result.stockByWarehouse).toEqual([
      expect.objectContaining({
        code: 'CENTRAL',
        totalStock: 11,
        reservedStock: 2,
        availableStock: 9,
      }),
      expect.objectContaining({
        code: 'DEPOSITO',
        totalStock: 4,
        availableStock: 4,
      }),
    ]);
  });

  it('agrupa la tendencia por fecha de confirmación', async () => {
    prisma.sale.findMany.mockResolvedValue([
      {
        confirmedAt: new Date('2026-07-01T12:00:00.000Z'),
        total: 100,
      },
      {
        confirmedAt: new Date('2026-07-01T15:00:00.000Z'),
        total: 50,
      },
      {
        confirmedAt: new Date('2026-07-03T12:00:00.000Z'),
        total: 25,
      },
    ]);

    const result = await service.getSalesTrend({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-03',
    });

    expect(result).toEqual({
      labels: ['2026-07-01', '2026-07-02', '2026-07-03'],
      data: [150, 0, 25],
    });
    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          confirmedAt: expect.any(Object),
        }),
        select: {
          confirmedAt: true,
          total: true,
        },
      }),
    );
  });
});
