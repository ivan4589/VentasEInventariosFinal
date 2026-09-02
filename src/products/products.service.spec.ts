import { ConflictException } from '@nestjs/common';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const prisma = {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    provider: {
      findUnique: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
    subCategory: {
      findUnique: jest.fn(),
    },
  };
  const audit = {
    record: jest.fn(),
  };

  let service: ProductsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductsService(prisma as any, audit as any);
  });

  it('busca productos activos por código o nombre normalizado', async () => {
    prisma.product.findMany.mockResolvedValue([]);

    await service.search('prd-001');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          OR: [
            { nameNormalized: { contains: 'prd-001' } },
            { code: { contains: 'PRD-001' } },
          ],
        },
        orderBy: { name: 'asc' },
      }),
    );
  });

  it('genera un código único cuando el administrador no proporciona uno', async () => {
    prisma.provider.findUnique.mockResolvedValue({ id: 'provider-1' });
    prisma.category.findUnique.mockResolvedValue({ id: 'category-1' });
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.product.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'product-1',
        ...data,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const created = await service.create(
      {
        name: 'Producto de prueba',
        providerId: 'provider-1',
        categoryId: 'category-1',
        purchasePrice: 10,
        priceNormal: 12,
        priceCamino: 12,
        priceEspecial: 0,
      },
      7,
    );

    expect(created.code).toMatch(/^PRD-[A-F0-9]{12}$/);
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: created.code }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PRODUCT_CREATED',
        entityId: 'product-1',
      }),
    );
  });

  it('impide asignar a otro producto un código existente', async () => {
    prisma.product.findUnique
      .mockResolvedValueOnce({
        id: 'product-1',
        code: 'PRD-ORIGINAL',
        name: 'Producto original',
        nameNormalized: 'producto original',
      })
      .mockResolvedValueOnce({ id: 'product-2' });

    await expect(
      service.update('product-1', { code: 'prd-repetido' }, 7),
    ).rejects.toThrow(ConflictException);

    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});
