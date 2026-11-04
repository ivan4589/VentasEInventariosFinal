import { BadRequestException, ConflictException } from '@nestjs/common';
import { DeliveryService } from './delivery.service';

describe('DeliveryService — two-truck invariants', () => {
  const sale = {
    id: 'sale-1', status: 'PENDING', deliveryMode: true, deliveryRevision: 3,
    details: [{ id: 'detail-1', productId: 'p1', quantity: 5, unitPrice: 10, subtotal: 50 }],
    bonusDetails: [], client: { type: 'NORMAL' }, discount: 0,
  };
  let service: DeliveryService;
  let tx: any;
  let prisma: any;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      sale: {
        findUnique: jest.fn().mockResolvedValue(sale),
        update: jest.fn().mockResolvedValue({}),
      },
      saleDeliveryEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'central' }) },
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'p1', priceNormal: 10, priceCamino: 10, priceEspecial: 10,
          priceMayorista: null, minQuantityWholesale: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      saleDetail: {
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([{ productId: 'p1', quantity: 3, subtotal: 30 }]),
      },
      payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    };
    prisma = {
      $transaction: jest.fn().mockImplementation((callback: (transaction: any) => Promise<any>) => callback(tx)),
    };
    service = new DeliveryService(prisma, { confirm: jest.fn() } as any);
    jest.spyOn(service, 'summary').mockResolvedValue({ saleId: 'sale-1', revision: 4 } as any);
  });

  it('rejects an overdelivery against the latest committed quantity', async () => {
    tx.saleDeliveryEvent.findMany.mockResolvedValue([
      { productId: 'p1', kind: 'DELIVER', quantity: 4 },
    ]);
    await expect(service.record('sale-1', 'p1', 'DELIVER', 2, 3, 'key-1', 12))
      .rejects.toThrow(BadRequestException);
    expect(tx.saleDeliveryEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a stale second truck', async () => {
    await expect(service.record('sale-1', 'p1', 'DELIVER', 1, 2, 'key-2', 12))
      .rejects.toThrow(ConflictException);
  });

  it('does not duplicate an idempotent delivery retry', async () => {
    tx.saleDeliveryEvent.findUnique.mockResolvedValue({
      saleId: 'sale-1', productId: 'p1', kind: 'DELIVER', quantity: 2, userId: 12,
    });
    await service.record('sale-1', 'p1', 'DELIVER', 2, 0, 'key-1', 12);
    expect(tx.saleDeliveryEvent.create).not.toHaveBeenCalled();
  });

  it('releases a reduced reservation immediately without removing physical stock', async () => {
    await service.adjustQuantity('sale-1', 'p1', 3, 3);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' }, data: { reservedStock: { increment: -2 } },
    });
    expect(tx.saleDetail.update).toHaveBeenCalledWith({
      where: { id: 'detail-1' }, data: { quantity: 3, subtotal: 30 },
    });
    expect(tx.sale.update).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: {
        subtotal: 30, total: 30, paymentStatus: 'PENDING',
        deliveryRevision: { increment: 1 },
      },
    });
  });

  it('cannot reduce the order below delivered units', async () => {
    tx.saleDeliveryEvent.findMany.mockResolvedValue([
      { productId: 'p1', kind: 'DELIVER', quantity: 4 },
    ]);
    await expect(service.adjustQuantity('sale-1', 'p1', 3, 3))
      .rejects.toThrow(BadRequestException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rolls back if the current stock cannot cover an increase', async () => {
    tx.$executeRaw.mockResolvedValue(0);
    await expect(service.adjustQuantity('sale-1', 'p1', 7, 3))
      .rejects.toThrow(BadRequestException);
    expect(tx.saleDetail.update).not.toHaveBeenCalled();
  });
});
