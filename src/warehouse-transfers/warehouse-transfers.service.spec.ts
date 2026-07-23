import { BadRequestException } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { WarehouseTransfersService } from './warehouse-transfers.service';

const central = {
  id: 'warehouse_central',
  name: 'Almacén Central',
};
const deposit = {
  id: 'warehouse_deposito',
  name: 'Depósito',
};
const product = {
  id: 'product_1',
  name: 'Fideo',
};

function createBasePrisma() {
  const prisma: any = {
    warehouse: {
      findMany: jest.fn().mockResolvedValue([central, deposit]),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([product]),
    },
    warehouseTransfer: {
      create: jest.fn().mockResolvedValue({ id: 'transfer_1' }),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    warehouseStock: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn(),
    },
    inventoryMovement: {
      createMany: jest.fn().mockResolvedValue({
        count: 2,
      }),
    },
  };

  prisma.$transaction = jest.fn(async (operation: (tx: any) => unknown) =>
    operation(prisma),
  );

  return prisma;
}

describe('WarehouseTransfersService', () => {
  it('rechaza usar el mismo almacén como origen y destino', async () => {
    const prisma = createBasePrisma();
    const service = new WarehouseTransfersService(prisma);

    await expect(
      service.create(
        {
          originWarehouseId: central.id,
          destinationWarehouseId: central.id,
          details: [
            {
              productId: product.id,
              quantity: 5,
            },
          ],
        },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.warehouseTransfer.create).not.toHaveBeenCalled();
  });

  it('transfiere el stock y registra salida y entrada', async () => {
    const prisma = createBasePrisma();
    const response = {
      id: 'transfer_1',
      status: $Enums.WarehouseTransferStatus.COMPLETED,
    };

    prisma.warehouseStock.findUnique
      .mockResolvedValueOnce({
        id: 'stock_central',
        stock: 20,
        reservedStock: 2,
      })
      .mockResolvedValueOnce({
        stock: 15,
      });
    prisma.warehouseStock.upsert.mockResolvedValue({
      stock: 8,
    });
    prisma.warehouseTransfer.findUnique.mockResolvedValue(response);

    const service = new WarehouseTransfersService(prisma);
    const result = await service.create(
      {
        originWarehouseId: central.id,
        destinationWarehouseId: deposit.id,
        details: [
          {
            productId: product.id,
            quantity: 5,
          },
        ],
        observations: 'Reposición',
      },
      1,
    );

    expect(result).toBe(response);
    expect(prisma.warehouseStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          stock: {
            decrement: 5,
          },
        },
      }),
    );
    expect(prisma.warehouseStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          stock: {
            increment: 5,
          },
        },
      }),
    );
    expect(prisma.inventoryMovement.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          type: $Enums.InventoryMovementType.TRANSFER_OUT,
          previousStock: 20,
          newStock: 15,
        }),
        expect.objectContaining({
          type: $Enums.InventoryMovementType.TRANSFER_IN,
          previousStock: 3,
          newStock: 8,
        }),
      ]),
    });
  });

  it('impide transferir más stock del disponible', async () => {
    const prisma = createBasePrisma();
    prisma.warehouseStock.findUnique.mockResolvedValue({
      id: 'stock_central',
      stock: 8,
      reservedStock: 4,
    });

    const service = new WarehouseTransfersService(prisma);

    await expect(
      service.create(
        {
          originWarehouseId: central.id,
          destinationWarehouseId: deposit.id,
          details: [
            {
              productId: product.id,
              quantity: 5,
            },
          ],
        },
        1,
      ),
    ).rejects.toThrow('tiene 4 disponibles');

    expect(prisma.inventoryMovement.createMany).not.toHaveBeenCalled();
  });

  it('anula una transferencia y devuelve el stock al origen', async () => {
    const prisma = createBasePrisma();
    const completedTransfer = {
      id: 'transfer_1',
      transferNumber: 'TR-20260723-ABC',
      status: $Enums.WarehouseTransferStatus.COMPLETED,
      originWarehouse: central,
      destinationWarehouse: deposit,
      details: [
        {
          productId: product.id,
          product: {
            name: product.name,
          },
          quantity: 5,
        },
      ],
    };
    const cancelledTransfer = {
      ...completedTransfer,
      status: $Enums.WarehouseTransferStatus.CANCELLED,
    };

    prisma.warehouseTransfer.findUnique
      .mockResolvedValueOnce(completedTransfer)
      .mockResolvedValueOnce(cancelledTransfer);
    prisma.warehouseStock.findUnique
      .mockResolvedValueOnce({
        id: 'stock_deposit',
        stock: 8,
        reservedStock: 0,
      })
      .mockResolvedValueOnce({
        stock: 3,
      });
    prisma.warehouseStock.upsert.mockResolvedValue({
      stock: 20,
    });

    const service = new WarehouseTransfersService(prisma);
    const result = await service.cancel('transfer_1', 1);

    expect(result).toBe(cancelledTransfer);
    expect(prisma.warehouseTransfer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'transfer_1',
          status: $Enums.WarehouseTransferStatus.COMPLETED,
        },
      }),
    );
    expect(prisma.inventoryMovement.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          warehouseId: deposit.id,
          type: $Enums.InventoryMovementType.TRANSFER_CANCEL_OUT,
        }),
        expect.objectContaining({
          warehouseId: central.id,
          type: $Enums.InventoryMovementType.TRANSFER_CANCEL_IN,
        }),
      ]),
    });
  });

  it('no anula si el destino ya no tiene el stock transferido disponible', async () => {
    const prisma = createBasePrisma();
    prisma.warehouseTransfer.findUnique.mockResolvedValue({
      id: 'transfer_1',
      transferNumber: 'TR-20260723-ABC',
      status: $Enums.WarehouseTransferStatus.COMPLETED,
      originWarehouse: central,
      destinationWarehouse: deposit,
      details: [
        {
          productId: product.id,
          product: {
            name: product.name,
          },
          quantity: 5,
        },
      ],
    });
    prisma.warehouseStock.findUnique.mockResolvedValue({
      id: 'stock_deposit',
      stock: 4,
      reservedStock: 0,
    });

    const service = new WarehouseTransfersService(prisma);

    await expect(service.cancel('transfer_1', 1)).rejects.toThrow(
      'No se puede anular',
    );

    expect(prisma.inventoryMovement.createMany).not.toHaveBeenCalled();
  });
});
