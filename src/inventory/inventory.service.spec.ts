jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  it('agrupa el stock positivo del Almacén Central por proveedor y categoría', async () => {
    const prisma: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'warehouse_central',
          name: 'Almacén Central',
          code: 'CENTRAL',
          stocks: [
            {
              stock: 12,
              reservedStock: 2,
              product: {
                id: 'product_fideo',
                name: 'Fideo Suprema',
                unit: 'CAJA',
                provider: {
                  id: 'provider_1',
                  companyName: 'Proveedor Uno',
                },
                category: {
                  id: 'category_1',
                  name: 'Alimentos',
                },
              },
            },
            {
              stock: 5,
              reservedStock: 1,
              product: {
                id: 'product_arroz',
                name: 'Arroz',
                unit: 'BOLSA',
                provider: {
                  id: 'provider_1',
                  companyName: 'Proveedor Uno',
                },
                category: {
                  id: 'category_1',
                  name: 'Alimentos',
                },
              },
            },
          ],
        }),
      },
    };
    const service = new InventoryService(prisma);

    const inventory = await service.getInventory();

    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDefault: true,
          isActive: true,
        },
        select: expect.objectContaining({
          stocks: expect.objectContaining({
            where: {
              stock: {
                gt: 0,
              },
            },
          }),
        }),
      }),
    );
    expect(inventory.totalProducts).toBe(2);
    expect(inventory.totalStock).toBe(17);
    expect(inventory.totalReservedStock).toBe(3);
    expect(inventory.totalAvailableStock).toBe(14);
    expect(inventory.providers).toHaveLength(1);
    expect(inventory.providers[0].categories[0].products).toHaveLength(2);
    expect(inventory.providers[0].categories[0].products[0]).not.toHaveProperty(
      'purchasePrice',
    );
  });

  it('rechaza la consulta si no existe un Almacén Central activo', async () => {
    const prisma: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new InventoryService(prisma);

    await expect(service.getInventory()).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
