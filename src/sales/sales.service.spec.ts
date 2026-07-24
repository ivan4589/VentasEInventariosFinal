jest.mock('../reports/reports.service', () => ({
  ReportsService: class ReportsService {},
}));

import { BadRequestException } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { SalesService } from './sales.service';

function createPrisma() {
  const prisma: any = {
    client: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'client_1',
        type: $Enums.ClientType.NORMAL,
      }),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'product_1',
          name: 'Fideo',
          stock: 100,
          reservedStock: 0,
          priceNormal: 10,
          priceCamino: 9,
          priceEspecial: 8,
          priceMayorista: null,
          minQuantityWholesale: null,
        },
      ]),
      update: jest.fn(),
    },
    warehouse: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'warehouse_central',
        name: 'Almacén Central',
      }),
    },
    warehouseStock: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    saleDetail: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    sale: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    inventoryMovement: {
      create: jest.fn(),
    },
  };

  prisma.$transaction = jest.fn(async (operation: (tx: any) => unknown) =>
    operation(prisma),
  );

  return prisma;
}

describe('SalesService - stock del Almacén Central', () => {
  it('bloquea una venta aunque exista stock global si el Central no tiene disponibilidad', async () => {
    const prisma = createPrisma();
    prisma.warehouseStock.findMany.mockResolvedValue([
      {
        productId: 'product_1',
        stock: 0,
        reservedStock: 0,
      },
    ]);
    const service = new SalesService(prisma, {
      generateSalePDF: jest.fn(),
    } as any);

    await expect(
      (service as any).validateAndPrepareDetails('client_1', [
        {
          productId: 'product_1',
          quantity: 1,
          unitPrice: 10,
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      (service as any).validateAndPrepareDetails('client_1', [
        {
          productId: 'product_1',
          quantity: 1,
          unitPrice: 10,
        },
      ]),
    ).rejects.toThrow('Almacén Central');
  });

  it('calcula la disponibilidad usando stock y reserva del Central', async () => {
    const prisma = createPrisma();
    prisma.warehouseStock.findMany.mockResolvedValue([
      {
        productId: 'product_1',
        stock: 10,
        reservedStock: 3,
      },
    ]);
    const service = new SalesService(prisma, {
      generateSalePDF: jest.fn(),
    } as any);

    const result = await (service as any).validateAndPrepareDetails(
      'client_1',
      [
        {
          productId: 'product_1',
          quantity: 7,
          unitPrice: 10,
        },
      ],
    );

    expect(result.centralWarehouse.id).toBe('warehouse_central');
    expect(result.preparedDetails).toEqual([
      expect.objectContaining({
        productId: 'product_1',
        quantity: 7,
      }),
    ]);
  });

  it('al confirmar descuenta el Central y registra el movimiento de salida', async () => {
    const prisma = createPrisma();
    prisma.sale.findUnique.mockResolvedValue({
      id: 'sale_1',
      saleNumber: '20260723-001',
      status: $Enums.SaleStatus.PENDING,
      details: [
        {
          productId: 'product_1',
          quantity: 4,
          product: {
            id: 'product_1',
            name: 'Fideo',
          },
        },
      ],
    });
    prisma.warehouseStock.findUnique.mockResolvedValue({
      id: 'central_stock_1',
      stock: 10,
      reservedStock: 4,
    });
    prisma.warehouseStock.update.mockResolvedValue({
      stock: 6,
    });
    const reports = {
      generateSalePDF: jest.fn().mockResolvedValue(null),
    };
    const service = new SalesService(prisma, reports as any);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'sale_1' } as any);

    await service.confirm('sale_1', 8);

    expect(prisma.warehouseStock.update).toHaveBeenCalledWith({
      where: {
        id: 'central_stock_1',
      },
      data: {
        stock: {
          decrement: 4,
        },
        reservedStock: {
          decrement: 4,
        },
      },
      select: {
        stock: true,
      },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        warehouseId: 'warehouse_central',
        productId: 'product_1',
        userId: 8,
        type: $Enums.InventoryMovementType.SALE_OUT,
        previousStock: 10,
        newStock: 6,
      }),
    });
  });
});
