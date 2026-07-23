import { BadRequestException } from '@nestjs/common';

jest.mock('../reports/reports.service', () => ({
  ReportsService: class ReportsService {},
}));

import { PurchasesService } from './purchases.service';

describe('PurchasesService', () => {
  const product = {
    id: 'product-1',
    name: 'Producto de prueba',
    providerId: 'provider-1',
    categoryId: 'category-1',
    provider: {
      id: 'provider-1',
      companyName: 'Proveedor',
    },
    category: {
      id: 'category-1',
      name: 'Categoría',
    },
  };

  const defaultWarehouse = {
    id: 'warehouse-central',
    name: 'Almacén Central',
  };

  const baseDetail = {
    productId: product.id,
    quantity: 10,
    unitPrice: 5,
    priceNormal: 6,
    priceCamino: 6,
    priceEspecial: 6,
    priceMayorista: 5.5,
    minQuantityWholesale: 5,
  };

  function createService() {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([product]),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue(defaultWarehouse),
        findMany: jest.fn().mockResolvedValue([]),
      },
      purchase: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'purchase-1',
          ...data,
          user: {
            name: 'Administrador',
          },
          status: 'PENDING',
          pdfUrl: null,
          providerGroups: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      },
    };

    const reportsService = {
      generatePurchasePDF: jest.fn(),
    };

    return {
      service: new PurchasesService(prisma as any, reportsService as any),
      prisma,
    };
  }

  it('asigna toda la cantidad al almacén predeterminado si no se envía distribución', async () => {
    const { service, prisma } = createService();

    await service.create(
      {
        details: [baseDetail],
      },
      1,
    );

    const createData = prisma.purchase.create.mock.calls[0][0].data;
    const savedDetail = createData.providerGroups.create[0].details.create[0];

    expect(savedDetail.warehouseDistributions.create).toEqual([
      {
        warehouseId: defaultWarehouse.id,
        quantity: 10,
      },
    ]);
  });

  it('rechaza una distribución cuya suma no coincide con la cantidad comprada', async () => {
    const { service, prisma } = createService();

    prisma.warehouse.findMany.mockResolvedValue([
      {
        id: 'warehouse-deposito',
        name: 'Depósito',
      },
    ]);

    await expect(
      service.create(
        {
          details: [
            {
              ...baseDetail,
              warehouseDistributions: [
                {
                  warehouseId: defaultWarehouse.id,
                  quantity: 4,
                },
                {
                  warehouseId: 'warehouse-deposito',
                  quantity: 5,
                },
              ],
            },
          ],
        },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.purchase.create).not.toHaveBeenCalled();
  });
});
