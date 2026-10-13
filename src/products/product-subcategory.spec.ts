import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

describe('validación de subcategoría de productos', () => {
  const existing = { id: 'p', code: 'P-1', name: 'Figura', categoryId: 'cat', subCategoryId: 'sub', nameNormalized: 'figura' };
  let prisma: any;
  let service: ProductsService;
  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn(({ where }) => Promise.resolve(where.id ? existing : null)), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(existing), update: jest.fn().mockResolvedValue(existing) },
      provider: { findUnique: jest.fn().mockResolvedValue({ id: 'provider' }) },
      category: { findUnique: jest.fn().mockResolvedValue({ id: 'cat' }) },
      subCategory: { findUnique: jest.fn().mockResolvedValue({ id: 'sub', categoryId: 'cat' }) },
    };
    service = new ProductsService(prisma, { record: jest.fn() } as any);
  });
  it('crear valida la pertenencia a la categoría y no escribe si es incompatible', async () => {
    await expect(service.create({ name: 'Figura', code: 'P-2', providerId: 'provider', categoryId: 'otra', subCategoryId: 'sub', purchasePrice: 1, priceNormal: 2, priceCamino: 2, priceEspecial: 2 }, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
  it('cambiar categoría exige quitar o cambiar una subcategoría incompatible', async () => {
    await expect(service.update('p', { categoryId: 'otra' }, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
  it('quitar una subcategoría con null no cambia código, precios ni existencias', async () => {
    await service.update('p', { subCategoryId: null }, 1);
    const data = prisma.product.update.mock.calls[0][0].data;
    expect(data.subCategoryId).toBeNull();
    expect(data.stock).toBeUndefined();
    expect(data.priceNormal).toBeUndefined();
    expect(data.code).toBeUndefined();
  });
  it('omitir subcategoría conserva la existente', async () => {
    await service.update('p', { description: 'Actualizada' }, 1);
    expect(prisma.product.update.mock.calls[0][0].data.subCategoryId).toBeUndefined();
  });
});
