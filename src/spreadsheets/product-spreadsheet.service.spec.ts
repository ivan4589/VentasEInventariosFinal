import ExcelJS from 'exceljs';
import {
  ProductSpreadsheetService,
  PRODUCT_SPREADSHEET_HEADERS,
} from './product-spreadsheet.service';
import { DataAuditService } from '../data-protection/data-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SpreadsheetFileService } from './spreadsheet-file.service';

async function productWorkbook(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Productos');
  sheet.addRow([...PRODUCT_SPREADSHEET_HEADERS]);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('ProductSpreadsheetService', () => {
  const existingProduct = {
    id: 'product-1',
    code: 'PRD-1',
    name: 'Fideo',
    nameNormalized: 'fideo',
    description: null,
    providerId: 'provider-1',
    categoryId: 'category-1',
    subCategoryId: 'subcategory-1',
    weight: null,
    purchasePrice: 8,
    priceNormal: 10,
    priceCamino: 9,
    priceEspecial: 8,
    priceMayorista: null,
    minQuantityWholesale: null,
    stock: 20,
    minStock: 0,
    unit: 'UNIDAD',
    reserveQuantity: 0,
    additionalInfo: null,
    isActive: true,
  };
  type ProductRecord = typeof existingProduct & Record<string, unknown>;
  type MutationArgs = { data: Record<string, unknown> };
  type TransactionOperation = (tx: PrismaMock) => Promise<unknown>;
  type PrismaMock = {
    provider: {
      findMany: jest.Mock<Promise<unknown[]>, unknown[]>;
    };
    category: {
      findMany: jest.Mock<Promise<unknown[]>, unknown[]>;
    };
    subCategory: {
      findMany: jest.Mock<Promise<unknown[]>, unknown[]>;
    };
    product: {
      findMany: jest.Mock<Promise<ProductRecord[]>, unknown[]>;
      findUnique: jest.Mock<Promise<ProductRecord | null>, unknown[]>;
      create: jest.Mock<Promise<ProductRecord>, [MutationArgs]>;
      update: jest.Mock<Promise<ProductRecord>, [MutationArgs]>;
    };
    $transaction: jest.Mock<Promise<unknown>, [TransactionOperation]>;
  };
  type AuditMock = {
    record: jest.Mock<Promise<void>, unknown[]>;
  };
  let prisma: PrismaMock;
  let audit: AuditMock;
  let service: ProductSpreadsheetService;

  beforeEach(() => {
    prisma = {
      provider: {
        findMany: jest
          .fn<Promise<unknown[]>, unknown[]>()
          .mockResolvedValue([
            { id: 'provider-1', companyName: 'Proveedor Uno', isActive: true },
          ]),
      },
      category: {
        findMany: jest
          .fn<Promise<unknown[]>, unknown[]>()
          .mockResolvedValue([{ id: 'category-1', name: 'Alimentos' }]),
      },
      subCategory: {
        findMany: jest
          .fn<Promise<unknown[]>, unknown[]>()
          .mockResolvedValue([
            { id: 'subcategory-1', name: 'Fideos', categoryId: 'category-1' },
          ]),
      },
      product: {
        findMany: jest
          .fn<Promise<ProductRecord[]>, unknown[]>()
          .mockResolvedValue([existingProduct]),
        findUnique: jest
          .fn<Promise<ProductRecord | null>, unknown[]>()
          .mockResolvedValue(existingProduct),
        create: jest
          .fn<Promise<ProductRecord>, [MutationArgs]>()
          .mockImplementation(({ data }) =>
            Promise.resolve({
              ...existingProduct,
              id: 'product-created',
              ...data,
            }),
          ),
        update: jest
          .fn<Promise<ProductRecord>, [MutationArgs]>()
          .mockImplementation(({ data }) =>
            Promise.resolve({
              ...existingProduct,
              ...data,
            }),
          ),
      },
      $transaction: jest.fn<Promise<unknown>, [TransactionOperation]>(),
    };
    prisma.$transaction.mockImplementation((operation) => operation(prisma));
    audit = {
      record: jest.fn<Promise<void>, unknown[]>().mockResolvedValue(undefined),
    };
    service = new ProductSpreadsheetService(
      prisma as unknown as PrismaService,
      audit as unknown as DataAuditService,
      new SpreadsheetFileService(),
    );
  });

  it('detecta productos nuevos y actualizaciones por código', async () => {
    const buffer = await productWorkbook([
      [
        '',
        'PRD-1',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '11',
        '',
        '',
        '',
        '',
        '999',
        '',
        '',
        '',
        '',
        '',
      ],
      [
        '',
        'PRD-2',
        'Arroz',
        '',
        'Proveedor Uno',
        'Alimentos',
        'Fideos',
        '',
        '5',
        '6',
        '0',
        '0',
        '',
        '',
        '999',
        '0',
        'UNIDAD',
        '0',
        '',
        '',
      ],
    ]);

    const preview = await service.preview(buffer);

    expect(preview.valid).toBe(true);
    expect(preview.summary).toEqual(
      expect.objectContaining({ created: 1, updated: 1, errors: 0 }),
    );
  });

  it('rechaza referencias maestras inexistentes', async () => {
    const buffer = await productWorkbook([
      [
        '',
        'PRD-2',
        'Arroz',
        '',
        'No existe',
        'Alimentos',
        '',
        '',
        '5',
        '6',
        '0',
        '0',
        '',
        '',
        '',
        '0',
        'UNIDAD',
        '0',
        '',
        '',
      ],
    ]);

    const preview = await service.preview(buffer);

    expect(preview.valid).toBe(false);
    expect(preview.rows[0].errors).toContain(
      'PROVEEDOR no existe en el sistema',
    );
  });

  it('marca como automático el código generado para un producto nuevo', async () => {
    const buffer = await productWorkbook([
      [
        '',
        '',
        'Arroz',
        '',
        'Proveedor Uno',
        'Alimentos',
        'Fideos',
        '',
        '5',
        '6',
        '0',
        '0',
        '',
        '',
        '',
        '0',
        'UNIDAD',
        '0',
        '',
        '',
      ],
    ]);

    const preview = await service.preview(buffer);

    expect(preview.valid).toBe(true);
    expect(preview.rows[0]).toEqual(
      expect.objectContaining({ action: 'CREATE', identifier: 'AUTOMATICO' }),
    );
  });

  it('acepta una exportación con nombres repetidos entre activos e inactivos', async () => {
    const inactiveProduct = { ...existingProduct, isActive: false };
    const activeProduct = {
      ...existingProduct,
      id: 'product-2',
      code: 'PRD-2',
      isActive: true,
    };
    prisma.product.findMany.mockResolvedValue([inactiveProduct, activeProduct]);
    const buffer = await productWorkbook([
      [inactiveProduct.id, ...Array(19).fill('')],
      [activeProduct.id, ...Array(19).fill('')],
    ]);

    const preview = await service.preview(buffer);

    expect(preview.valid).toBe(true);
    expect(preview.summary).toEqual(
      expect.objectContaining({ unchanged: 2, errors: 0 }),
    );
  });

  it('actualiza datos y nunca importa el stock de la hoja', async () => {
    const buffer = await productWorkbook([
      [
        '',
        'PRD-1',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '11',
        '',
        '',
        '',
        '',
        '999',
        '',
        '',
        '',
        '',
        '',
      ],
      [
        '',
        'PRD-2',
        'Arroz',
        '',
        'Proveedor Uno',
        'Alimentos',
        'Fideos',
        '',
        '5',
        '6',
        '0',
        '0',
        '',
        '',
        '999',
        '0',
        'UNIDAD',
        '0',
        '',
        '',
      ],
    ]);

    const result = await service.import(buffer, 1);

    expect(result.summary.created).toBe(1);
    expect(result.summary.updated).toBe(1);
    expect(prisma.product.update.mock.calls[0][0].data).not.toHaveProperty(
      'stock',
    );
    expect(prisma.product.create.mock.calls[0][0].data.stock).toBe(0);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });
});
