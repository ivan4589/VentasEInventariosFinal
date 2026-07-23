import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportHistoryService } from '../reports/report-history.service';
import { CollectionsService } from './collections.service';

jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));

describe('CollectionsService', () => {
  let service: CollectionsService;

  const prisma = {
    sale: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    collectionAssignment: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };

  const createAssignableSale = (
    saleType: $Enums.SaleType,
  ) => ({
    id: `sale-${saleType.toLowerCase()}`,
    saleNumber: `20260723-${saleType}`,
    saleType,
    status: $Enums.SaleStatus.CONFIRMED,
    paymentStatus: $Enums.PaymentStatus.PENDING,
    total: 100,
    payments: [],
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectionsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ReportHistoryService,
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CollectionsService);
  });

  it('agrupa las ventas por cobrar y a crédito y calcula el saldo general', async () => {
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        saleNumber: '20260723-001',
        saleType: $Enums.SaleType.CASH,
        clientId: 'client-1',
        client: {
          id: 'client-1',
          fullName: 'Tienda Central',
          alias: null,
          phone: '70000001',
          location: {
            name: 'Chulumani',
          },
        },
        date: new Date('2026-07-20T12:00:00Z'),
        dueDate: new Date('2026-07-21T12:00:00Z'),
        total: 100,
        paymentStatus: $Enums.PaymentStatus.PARTIALLY_PAID,
        payments: [
          {
            amount: 25,
          },
        ],
        collectionAssignment: null,
      },
      {
        id: 'sale-2',
        saleNumber: '20260723-002',
        saleType: $Enums.SaleType.CREDIT,
        clientId: 'client-1',
        client: {
          id: 'client-1',
          fullName: 'Tienda Central',
          alias: null,
          phone: '70000001',
          location: {
            name: 'Chulumani',
          },
        },
        date: new Date('2026-07-22T12:00:00Z'),
        dueDate: new Date('2099-07-29T12:00:00Z'),
        total: 50,
        paymentStatus: $Enums.PaymentStatus.PENDING,
        payments: [],
        collectionAssignment: {
          id: 'assignment-1',
          assignedAt: new Date('2026-07-22T13:00:00Z'),
          assignedTo: {
            id: 2,
            name: 'Cobrador Uno',
            role: $Enums.Role.COBRADOR,
          },
          assignedBy: {
            id: 1,
            name: 'Administrador',
          },
        },
      },
    ]);

    const result = await service.findDebts({
      id: 1,
      role: $Enums.Role.ADMIN,
    });

    expect(result.clients).toHaveLength(1);
    expect(result.clients[0].sales).toHaveLength(2);
    expect(result.summary.totalDebt).toBe(150);
    expect(result.summary.totalPaid).toBe(25);
    expect(result.summary.totalBalance).toBe(125);
    expect(result.summary.unassignedSalesCount).toBe(1);

    const query = prisma.sale.findMany.mock.calls[0][0];

    expect(query.where).toEqual(
      expect.objectContaining({
        status: $Enums.SaleStatus.CONFIRMED,
        paymentStatus: {
          in: [
            $Enums.PaymentStatus.PENDING,
            $Enums.PaymentStatus.PARTIALLY_PAID,
          ],
        },
      }),
    );
    expect(query.where).not.toHaveProperty('saleType');
  });

  it('limita a cada usuario a sus propias asignaciones', async () => {
    prisma.sale.findMany.mockResolvedValue([]);

    await service.findDebts({
      id: 7,
      role: $Enums.Role.VENDEDOR,
    });

    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          collectionAssignment: {
            is: {
              assignedToId: 7,
            },
          },
        }),
      }),
    );
  });

  it('rechaza el cobro de una venta asignada a otro usuario', async () => {
    prisma.collectionAssignment.findUnique.mockResolvedValue({
      assignedToId: 8,
    });

    await expect(
      service.assertCanCollect('sale-1', {
        id: 7,
        role: $Enums.Role.COBRADOR,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    $Enums.SaleType.CASH,
    $Enums.SaleType.CREDIT,
  ])(
    'permite asignar una venta %s confirmada con saldo',
    async (saleType) => {
      prisma.sale.findUnique.mockResolvedValue(
        createAssignableSale(saleType),
      );
      prisma.user.findUnique.mockResolvedValue({
        id: 7,
        name: 'Responsable',
        role: $Enums.Role.COBRADOR,
      });
      prisma.collectionAssignment.upsert.mockResolvedValue({
        id: 'assignment-1',
        saleId: `sale-${saleType.toLowerCase()}`,
        assignedAt: new Date('2026-07-23T12:00:00Z'),
        assignedTo: {
          id: 7,
          name: 'Responsable',
          role: $Enums.Role.COBRADOR,
        },
        assignedBy: {
          id: 1,
          name: 'Administrador',
        },
      });

      await expect(
        service.assign(
          `sale-${saleType.toLowerCase()}`,
          7,
          {
            id: 1,
            role: $Enums.Role.ADMIN,
          },
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          message:
            'Cobranza asignada correctamente',
        }),
      );
    },
  );
});
