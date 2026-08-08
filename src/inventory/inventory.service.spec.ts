jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));
import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const storage: any = {
    savePrivatePdf: jest.fn((_folder, filename) =>
      Promise.resolve(`/uploads/reports/${filename}`),
    ),
  };

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
    const service = new InventoryService(prisma, storage);

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
    const service = new InventoryService(prisma, storage);

    await expect(service.getInventory()).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('devuelve la ruta protegida del PDF generado', async () => {
    const page = {
      setContent: jest.fn(),
      pdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    const browser = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn(),
    };
    const puppeteerMock = jest.requireMock('puppeteer') as {
      launch: jest.Mock;
    };
    puppeteerMock.launch.mockResolvedValue(browser);

    const prisma: any = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'warehouse_central',
          name: 'Almacén Central',
          code: 'CENTRAL',
          stocks: [],
        }),
      },
      reportHistory: {
        create: jest.fn().mockResolvedValue({ id: 'history_123' }),
      },
    };
    const service = new InventoryService(prisma, storage);

    const result = await service.generateInventoryPDF(7);

    expect(result).toEqual({
      pdfUrl: '/api/documents/reports/history_123',
      historyId: 'history_123',
    });
    expect(prisma.reportHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileUrl: expect.stringMatching(/^\/uploads\/reports\/.+\.pdf$/),
          userId: 7,
        }),
      }),
    );
    expect(browser.close).toHaveBeenCalled();
  });
});
