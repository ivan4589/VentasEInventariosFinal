import { Test, TestingModule } from '@nestjs/testing';
import { $Enums } from '../../generated/prisma/client';
import { CollectionsService } from '../collections/collections.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';

jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));

describe('PaymentsService', () => {
  let service: PaymentsService;

  const prisma = {
    sale: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const collectionsService = {
    assertCanCollect: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(
      async (callback) => callback(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: CollectionsService,
          useValue: collectionsService,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it.each([
    $Enums.SaleType.CASH,
    $Enums.SaleType.CREDIT,
  ])(
    'registra pagos de cobranza para una venta %s con saldo',
    async (saleType) => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        saleType,
        status: $Enums.SaleStatus.CONFIRMED,
        paymentStatus: $Enums.PaymentStatus.PENDING,
        clientId: 'client-1',
        total: 100,
        payments: [],
        client: {
          id: 'client-1',
          fullName: 'Cliente Uno',
        },
      });
      prisma.payment.create.mockResolvedValue({
        id: 'payment-1',
        saleId: 'sale-1',
        clientId: 'client-1',
        userId: 7,
        amount: 25,
        method: $Enums.PaymentMethod.CASH,
        reference: null,
        observations: null,
        receivedAt: new Date('2026-07-23T12:00:00Z'),
        createdAt: new Date('2026-07-23T12:00:00Z'),
        updatedAt: new Date('2026-07-23T12:00:00Z'),
        client: {
          fullName: 'Cliente Uno',
        },
        user: {
          name: 'Responsable',
        },
      });

      await expect(
        service.create(
          {
            saleId: 'sale-1',
            clientId: 'client-1',
            amount: 25,
            method: $Enums.PaymentMethod.CASH,
          },
          {
            id: 7,
            role: $Enums.Role.COBRADOR,
          },
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'payment-1',
          amount: 25,
        }),
      );

      expect(
        collectionsService.assertCanCollect,
      ).toHaveBeenCalledWith('sale-1', {
        id: 7,
        role: $Enums.Role.COBRADOR,
      });
      expect(prisma.sale.update).toHaveBeenCalledWith({
        where: {
          id: 'sale-1',
        },
        data: {
          paymentStatus:
            $Enums.PaymentStatus.PARTIALLY_PAID,
        },
      });
    },
  );
});
