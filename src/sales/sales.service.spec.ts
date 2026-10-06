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
  it('no vuelve a descontar stock ni cambia quién confirmó al repetir la confirmación', async () => {
    const prisma = createPrisma();
    prisma.sale.findUnique.mockResolvedValue({ status: $Enums.SaleStatus.CONFIRMED });
    const service = new SalesService(prisma, { generateSalePDF: jest.fn().mockResolvedValue(null) } as any);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'sale_1' } as any);
    await service.confirm('sale_1', 9);
    expect(prisma.warehouseStock.update).not.toHaveBeenCalled();
    expect(prisma.sale.update).not.toHaveBeenCalled();
  });
  it('recalcula al cambiar el cliente sin reemplazar al creador', async () => {
    const prisma = createPrisma();
    prisma.sale.findUnique.mockResolvedValue({
      id: 'sale_1', userId: 1, clientId: 'client_1', status: $Enums.SaleStatus.PENDING,
      saleType: $Enums.SaleType.CASH, dueDate: null, subtotal: 10, discount: 0,
      details: [{ productId: 'product_1', quantity: 1, unitPrice: 10 }],
    });
    prisma.saleDetail.deleteMany = jest.fn();
    prisma.saleDetail.createMany = jest.fn();
    prisma.payment = { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) };
    const service = new SalesService(prisma, {} as any);
    const prepare = jest.spyOn(service as any, 'validateAndPrepareDetails').mockResolvedValue({
      centralWarehouse: { id: 'warehouse_central' },
      preparedDetails: [{ productId: 'product_1', quantity: 1, unitPrice: 8, subtotal: 8 }],
    });
    jest.spyOn(service, 'findOne').mockResolvedValue({ paymentStatus: $Enums.PaymentStatus.PENDING } as any);
    await service.update('sale_1', { clientId: 'client_2' }, $Enums.Role.VENDEDOR, 2);
    expect(prepare).toHaveBeenCalledWith('client_2', [expect.objectContaining({ manualPrice: false })], 'sale_1', $Enums.Role.VENDEDOR);
    const data = prisma.sale.update.mock.calls[0][0].data;
    expect(data.subtotal).toBe(8);
    expect(data).not.toHaveProperty('userId');
  });
  it('impide al vendedor cambiar el descuento de una preventa', async () => {
    const prisma = createPrisma();
    prisma.sale.findUnique.mockResolvedValue({ status: $Enums.SaleStatus.PENDING, discount: 5 });
    const service = new SalesService(prisma, {} as any);
    await expect(service.update('sale_1', { discount: 0 }, $Enums.Role.VENDEDOR, 2)).rejects.toThrow('Solo el administrador');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('registra al editor real al confirmar automáticamente una preventa pagada', async () => {
    const prisma = createPrisma();
    prisma.sale.findUnique.mockResolvedValue({
      id: 'sale_1', userId: 1, clientId: 'client_1', status: $Enums.SaleStatus.PENDING,
      saleType: $Enums.SaleType.CASH, dueDate: null, subtotal: 10, discount: 0, details: [],
    });
    prisma.payment = { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 10 } }) };
    const service = new SalesService(prisma, {} as any);
    jest.spyOn(service, 'findOne').mockResolvedValue({ userId: 1, paymentStatus: $Enums.PaymentStatus.PAID } as any);
    const confirm = jest.spyOn(service, 'confirm').mockResolvedValue({ id: 'sale_1' } as any);
    await service.update('sale_1', { observations: 'Entrega' }, $Enums.Role.VENDEDOR, 2);
    expect(confirm).toHaveBeenCalledWith('sale_1', 2);
  });
  it('ignora el precio arbitrario enviado por un vendedor con precio automático', async () => {
    const prisma = createPrisma();
    prisma.warehouseStock.findMany.mockResolvedValue([{ productId: 'product_1', stock: 10, reservedStock: 0 }]);
    const service = new SalesService(prisma, {} as any);
    const result = await (service as any).validateAndPrepareDetails('client_1', [
      { productId: 'product_1', quantity: 2, unitPrice: 1, manualPrice: false },
    ], undefined, $Enums.Role.VENDEDOR);
    expect(result.preparedDetails[0]).toEqual(expect.objectContaining({ unitPrice: 10, subtotal: 20 }));
  });
  it('rechaza precios manuales del vendedor aunque manipule la petición', async () => {
    const service = new SalesService(createPrisma(), {} as any);
    await expect((service as any).validateAndPrepareDetails('client_1', [
      { productId: 'product_1', quantity: 1, unitPrice: 1, manualPrice: true },
    ], undefined, $Enums.Role.VENDEDOR)).rejects.toThrow('Solo el administrador');
  });
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

  it('respeta el precio unitario modificado manualmente', async () => {
    const prisma = createPrisma();
    prisma.warehouseStock.findMany.mockResolvedValue([
      {
        productId: 'product_1',
        stock: 10,
        reservedStock: 0,
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
          quantity: 5,
          unitPrice: 11,
          manualPrice: true,
        },
      ],
    );

    expect(result.preparedDetails).toEqual([
      expect.objectContaining({
        productId: 'product_1',
        quantity: 5,
        unitPrice: 11,
        subtotal: 55,
      }),
    ]);
  });

  it('mantiene el precio automático cuando no fue modificado', async () => {
    const prisma = createPrisma();
    prisma.warehouseStock.findMany.mockResolvedValue([
      {
        productId: 'product_1',
        stock: 10,
        reservedStock: 0,
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
          quantity: 5,
          unitPrice: 11,
          manualPrice: false,
        },
      ],
    );

    expect(result.preparedDetails).toEqual([
      expect.objectContaining({
        productId: 'product_1',
        quantity: 5,
        unitPrice: 10,
        subtotal: 50,
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
    expect(prisma.sale.update).toHaveBeenCalledWith({
      where: { id: 'sale_1' },
      data: expect.objectContaining({ confirmedById: 8 }),
    });

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
