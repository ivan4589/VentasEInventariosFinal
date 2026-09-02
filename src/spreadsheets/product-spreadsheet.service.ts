import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  normalizeDisplayText,
  normalizeOptionalText,
  normalizeSearchText,
} from '../data-protection/data-normalization';
import { DataAuditService } from '../data-protection/data-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SpreadsheetFileService } from './spreadsheet-file.service';
import {
  PreparedSpreadsheetImport,
  SpreadsheetImportAction,
  SpreadsheetPreviewRow,
} from './spreadsheet.types';

export const PRODUCT_SPREADSHEET_HEADERS = [
  'ID_SISTEMA',
  'CODIGO',
  'NOMBRE',
  'DESCRIPCION',
  'PROVEEDOR',
  'CATEGORIA',
  'SUBCATEGORIA',
  'PRESENTACION',
  'PRECIO_COMPRA',
  'PRECIO_NORMAL',
  'PRECIO_CAMINO',
  'PRECIO_ESPECIAL',
  'PRECIO_MAYORISTA',
  'CANTIDAD_MIN_MAYORISTA',
  'STOCK_SOLO_LECTURA',
  'STOCK_MINIMO',
  'UNIDAD',
  'CANTIDAD_RESERVA',
  'INFORMACION_ADICIONAL',
  'ESTADO_SOLO_LECTURA',
] as const;

interface PreparedProductRow {
  row: number;
  action: SpreadsheetImportAction;
  existingId?: string;
  displayName: string;
  data: {
    code?: string;
    name?: string;
    nameNormalized?: string;
    description?: string | null;
    providerId?: string;
    categoryId?: string;
    subCategoryId?: string | null;
    weight?: string | null;
    purchasePrice?: number;
    priceNormal?: number;
    priceCamino?: number;
    priceEspecial?: number;
    priceMayorista?: number | null;
    minQuantityWholesale?: number | null;
    minStock?: number;
    unit?: string;
    reserveQuantity?: number;
    additionalInfo?: string | null;
  };
}

@Injectable()
export class ProductSpreadsheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: DataAuditService,
    private readonly files: SpreadsheetFileService,
  ) {}

  async template() {
    return this.workbook([]);
  }

  async export() {
    const products = await this.prisma.product.findMany({
      include: {
        provider: true,
        category: true,
        subCategory: true,
        warehouseStocks: {
          where: { warehouse: { isDefault: true, isActive: true } },
          select: { stock: true },
          take: 1,
        },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return this.workbook(
      products.map((product) => [
        product.id,
        product.code,
        product.name,
        product.description || '',
        product.provider.companyName,
        product.category.name,
        product.subCategory?.name || '',
        product.weight || '',
        product.purchasePrice,
        product.priceNormal,
        product.priceCamino,
        product.priceEspecial,
        product.priceMayorista ?? '',
        product.minQuantityWholesale ?? '',
        product.warehouseStocks[0]?.stock ?? product.stock,
        product.minStock,
        product.unit,
        product.reserveQuantity,
        product.additionalInfo || '',
        product.isActive ? 'ACTIVO' : 'INACTIVO',
      ]),
    );
  }

  async preview(contents: Buffer) {
    const result = await this.prepare(contents);
    return this.publicPreview(result);
  }

  async import(contents: Buffer, actorId: number) {
    const result = await this.prepare(contents);
    if (!result.valid) {
      throw new BadRequestException({
        message: 'Corrige todas las filas antes de confirmar la importación',
        preview: this.publicPreview(result),
      });
    }

    await this.prisma.$transaction(
      async (tx) => {
        for (const row of result.prepared) {
          if (row.action === 'UNCHANGED') continue;

          if (row.action === 'CREATE') {
            const created = await tx.product.create({
              data: {
                code: row.data.code!,
                name: row.data.name!,
                nameNormalized: row.data.nameNormalized!,
                description: row.data.description ?? null,
                providerId: row.data.providerId!,
                categoryId: row.data.categoryId!,
                subCategoryId: row.data.subCategoryId ?? null,
                weight: row.data.weight ?? null,
                purchasePrice: row.data.purchasePrice!,
                priceNormal: row.data.priceNormal!,
                priceCamino: row.data.priceCamino!,
                priceEspecial: row.data.priceEspecial!,
                priceMayorista: row.data.priceMayorista ?? null,
                minQuantityWholesale: row.data.minQuantityWholesale ?? null,
                stock: 0,
                minStock: row.data.minStock ?? 0,
                unit: row.data.unit || 'UNIDAD',
                reserveQuantity: row.data.reserveQuantity ?? 0,
                additionalInfo: row.data.additionalInfo ?? null,
              },
            });
            await this.audit.record(
              {
                userId: actorId,
                action: 'PRODUCT_CREATED',
                entityType: 'PRODUCT',
                entityId: created.id,
                reason: 'Importación masiva mediante Excel',
                after: created,
              },
              tx,
            );
            continue;
          }

          const current = await tx.product.findUnique({
            where: { id: row.existingId! },
          });
          if (!current) {
            throw new BadRequestException(
              `El producto de la fila ${row.row} cambió después de la vista previa`,
            );
          }
          const updated = await tx.product.update({
            where: { id: current.id },
            data: row.data,
          });
          const priceFields = [
            'purchasePrice',
            'priceNormal',
            'priceCamino',
            'priceEspecial',
            'priceMayorista',
          ] as const;
          const pricesChanged = priceFields.some(
            (field) =>
              row.data[field] !== undefined &&
              row.data[field] !== current[field],
          );
          await this.audit.record(
            {
              userId: actorId,
              action: pricesChanged
                ? 'PRODUCT_PRICES_UPDATED'
                : row.data.code !== undefined && row.data.code !== current.code
                  ? 'PRODUCT_CODE_UPDATED'
                  : 'PRODUCT_UPDATED',
              entityType: 'PRODUCT',
              entityId: current.id,
              reason: 'Actualización masiva mediante Excel',
              before: current,
              after: updated,
            },
            tx,
          );
        }
      },
      { maxWait: 10_000, timeout: 120_000 },
    );

    return {
      message: 'Importación de productos completada correctamente',
      summary: result.summary,
    };
  }

  private async workbook(rows: unknown[][]) {
    const [providers, categories, subCategories] = await Promise.all([
      this.prisma.provider.findMany({
        where: { isActive: true },
        orderBy: { companyName: 'asc' },
        select: { companyName: true },
      }),
      this.prisma.category.findMany({
        orderBy: { name: 'asc' },
        select: { name: true },
      }),
      this.prisma.subCategory.findMany({
        orderBy: { name: 'asc' },
        select: { name: true },
      }),
    ]);
    const { workbook, worksheet } = this.files.createWorkbook(
      'Productos',
      PRODUCT_SPREADSHEET_HEADERS,
      [
        28, 18, 30, 36, 28, 24, 24, 20, 17, 17, 17, 17, 19, 25, 23, 17, 15, 20,
        40, 23,
      ],
      rows,
    );
    this.files.addCatalogSheet(workbook, [
      {
        header: 'PROVEEDORES_ACTIVOS',
        values: providers.map((provider) => provider.companyName),
        width: 34,
      },
      {
        header: 'CATEGORIAS',
        values: categories.map((category) => category.name),
        width: 28,
      },
      {
        header: 'SUBCATEGORIAS',
        values: subCategories.map((subCategory) => subCategory.name),
        width: 28,
      },
    ]);
    this.files.addInstructionsSheet(workbook, [
      'No cambies los nombres ni el orden de las columnas de la hoja Productos.',
      'ID_SISTEMA identifica una actualización exacta. Déjalo vacío para filas nuevas.',
      'Sin ID_SISTEMA, CODIGO identifica un producto existente; un código nuevo crea el producto.',
      'CODIGO puede quedar vacío en productos nuevos y el sistema generará uno automáticamente.',
      'Las celdas vacías no modifican datos existentes. Escribe BORRAR para limpiar campos opcionales.',
      'PROVEEDOR, CATEGORIA y SUBCATEGORIA deben existir. La subcategoría debe pertenecer a la categoría indicada.',
      'STOCK_SOLO_LECTURA es informativo. La importación nunca modifica existencias ni reservas de almacén.',
      'ESTADO_SOLO_LECTURA es informativo y nunca activa ni desactiva productos.',
      'Los precios admiten cero. La importación no guardará nada mientras exista una fila con error.',
    ]);

    this.files.applyListValidation(
      worksheet,
      5,
      `'Catalogos'!$A$2:$A$${Math.max(2, providers.length + 1)}`,
    );
    this.files.applyListValidation(
      worksheet,
      6,
      `'Catalogos'!$B$2:$B$${Math.max(2, categories.length + 1)}`,
    );
    this.files.applyListValidation(
      worksheet,
      7,
      `'Catalogos'!$C$2:$C$${Math.max(2, subCategories.length + 1)}`,
    );
    worksheet.getColumn(1).numFmt = '@';
    worksheet.getColumn(2).numFmt = '@';
    return this.files.toBuffer(workbook);
  }

  private async prepare(
    contents: Buffer,
  ): Promise<PreparedSpreadsheetImport<PreparedProductRow>> {
    const rows = await this.files.readRows(
      contents,
      'Productos',
      PRODUCT_SPREADSHEET_HEADERS,
    );
    const [providers, categories, subCategories, products] = await Promise.all([
      this.prisma.provider.findMany(),
      this.prisma.category.findMany(),
      this.prisma.subCategory.findMany(),
      this.prisma.product.findMany(),
    ]);
    const providerByName = new Map(
      providers.map((provider) => [
        normalizeSearchText(provider.companyName),
        provider,
      ]),
    );
    const categoryByName = new Map(
      categories.map((category) => [
        normalizeSearchText(category.name),
        category,
      ]),
    );
    const subCategoryByKey = new Map(
      subCategories.map((subCategory) => [
        `${subCategory.categoryId}:${normalizeSearchText(subCategory.name)}`,
        subCategory,
      ]),
    );
    const subCategoryById = new Map(
      subCategories.map((subCategory) => [subCategory.id, subCategory]),
    );
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    const productByCode = new Map(
      products.map((product) => [product.code, product]),
    );
    const activeProductByName = new Map(
      products
        .filter((product) => product.isActive)
        .map((product) => [product.nameNormalized, product]),
    );
    const usedCodes = new Set(products.map((product) => product.code));
    const claimedTargets = new Map<string, number>();
    const claimedCodes = new Map<string, number>();
    const claimedNames = new Map<string, number>();
    const prepared: PreparedProductRow[] = [];
    const previewRows: SpreadsheetPreviewRow[] = [];

    for (const source of rows) {
      const errors: string[] = [];
      const id = source.values.ID_SISTEMA.trim();
      const rawCode = source.values.CODIGO.trim();
      const normalizedInputCode = rawCode.toUpperCase();
      let existing = id ? productById.get(id) : undefined;
      if (id && !existing)
        errors.push('ID_SISTEMA no corresponde a un producto');
      if (!id && rawCode && !this.files.isDeleteMarker(rawCode)) {
        existing = productByCode.get(normalizedInputCode);
      }
      const isCreate = !existing;
      const data: PreparedProductRow['data'] = {};

      if (isCreate && !rawCode) {
        data.code = this.generateCode(usedCodes);
      } else if (rawCode) {
        if (this.files.isDeleteMarker(rawCode)) {
          errors.push('CODIGO no se puede borrar');
        } else if (
          normalizedInputCode.length > 40 ||
          !/^[A-Z0-9-]+$/.test(normalizedInputCode)
        ) {
          errors.push(
            'CODIGO solo admite letras, números y guiones (máximo 40)',
          );
        } else {
          data.code = normalizedInputCode;
        }
      }

      const rawName = source.values.NOMBRE;
      if (isCreate || rawName.trim()) {
        const name = this.files.requiredText(rawName, 'NOMBRE', errors);
        if (name) {
          const normalized = normalizeDisplayText(name);
          if (normalized.length > 180) {
            errors.push('NOMBRE no puede superar 180 caracteres');
          } else {
            data.name = normalized;
            data.nameNormalized = normalizeSearchText(normalized);
          }
        }
      }

      this.setOptionalText(data, 'description', source.values.DESCRIPCION);
      this.setOptionalText(data, 'weight', source.values.PRESENTACION);
      this.setOptionalText(
        data,
        'additionalInfo',
        source.values.INFORMACION_ADICIONAL,
      );

      const rawProvider = source.values.PROVEEDOR.trim();
      if (isCreate || rawProvider) {
        const provider = providerByName.get(normalizeSearchText(rawProvider));
        if (!rawProvider || !provider) {
          errors.push('PROVEEDOR no existe en el sistema');
        } else if (!provider.isActive && provider.id !== existing?.providerId) {
          errors.push('PROVEEDOR está inactivo');
        } else {
          data.providerId = provider.id;
        }
      }

      const rawCategory = source.values.CATEGORIA.trim();
      if (isCreate || rawCategory) {
        const category = categoryByName.get(normalizeSearchText(rawCategory));
        if (!rawCategory || !category) {
          errors.push('CATEGORIA no existe en el sistema');
        } else {
          data.categoryId = category.id;
        }
      }

      const finalCategoryId = data.categoryId || existing?.categoryId;
      const rawSubCategory = source.values.SUBCATEGORIA;
      if (rawSubCategory.trim()) {
        if (this.files.isDeleteMarker(rawSubCategory)) {
          data.subCategoryId = null;
        } else if (finalCategoryId) {
          const subCategory = subCategoryByKey.get(
            `${finalCategoryId}:${normalizeSearchText(rawSubCategory)}`,
          );
          if (!subCategory) {
            errors.push('SUBCATEGORIA no existe o no pertenece a CATEGORIA');
          } else {
            data.subCategoryId = subCategory.id;
          }
        }
      } else if (isCreate) {
        data.subCategoryId = null;
      }
      const finalSubCategoryId =
        data.subCategoryId !== undefined
          ? data.subCategoryId
          : existing?.subCategoryId;
      if (
        finalSubCategoryId &&
        finalCategoryId &&
        subCategoryById.get(finalSubCategoryId)?.categoryId !== finalCategoryId
      ) {
        errors.push(
          'SUBCATEGORIA actual no pertenece a la nueva CATEGORIA; indica otra o escribe BORRAR',
        );
      }

      this.setNumber(
        data,
        'purchasePrice',
        source.values.PRECIO_COMPRA,
        'PRECIO_COMPRA',
        errors,
        isCreate,
      );
      this.setNumber(
        data,
        'priceNormal',
        source.values.PRECIO_NORMAL,
        'PRECIO_NORMAL',
        errors,
        isCreate,
      );
      this.setNumber(
        data,
        'priceCamino',
        source.values.PRECIO_CAMINO,
        'PRECIO_CAMINO',
        errors,
        isCreate,
      );
      this.setNumber(
        data,
        'priceEspecial',
        source.values.PRECIO_ESPECIAL,
        'PRECIO_ESPECIAL',
        errors,
        isCreate,
      );
      this.setNullableNumber(
        data,
        'priceMayorista',
        source.values.PRECIO_MAYORISTA,
        'PRECIO_MAYORISTA',
        errors,
      );
      this.setNullableNumber(
        data,
        'minQuantityWholesale',
        source.values.CANTIDAD_MIN_MAYORISTA,
        'CANTIDAD_MIN_MAYORISTA',
        errors,
        true,
      );
      this.setNumber(
        data,
        'minStock',
        source.values.STOCK_MINIMO,
        'STOCK_MINIMO',
        errors,
        false,
      );
      this.setNumber(
        data,
        'reserveQuantity',
        source.values.CANTIDAD_RESERVA,
        'CANTIDAD_RESERVA',
        errors,
        false,
      );

      const rawUnit = source.values.UNIDAD.trim();
      if (isCreate || rawUnit) {
        if (this.files.isDeleteMarker(rawUnit)) {
          errors.push('UNIDAD no se puede borrar');
        } else {
          data.unit = normalizeDisplayText(rawUnit || 'UNIDAD').toUpperCase();
        }
      }

      if (isCreate) {
        data.description ??= null;
        data.weight ??= null;
        data.priceMayorista ??= null;
        data.minQuantityWholesale ??= null;
        data.minStock ??= 0;
        data.reserveQuantity ??= 0;
        data.additionalInfo ??= null;
        data.unit ??= 'UNIDAD';
      }

      const finalCode = data.code || existing?.code;
      if (finalCode) {
        const owner = productByCode.get(finalCode);
        if (owner && owner.id !== existing?.id) {
          errors.push('CODIGO ya pertenece a otro producto');
        }
        const claimedRow = claimedCodes.get(finalCode);
        if (claimedRow) {
          errors.push(`CODIGO también aparece en la fila ${claimedRow}`);
        } else {
          claimedCodes.set(finalCode, source.row);
        }
        usedCodes.add(finalCode);
      }

      const finalNameNormalized =
        data.nameNormalized || existing?.nameNormalized;
      const finalIsActive = existing?.isActive ?? true;
      if (finalIsActive && finalNameNormalized) {
        const owner = activeProductByName.get(finalNameNormalized);
        if (owner && owner.id !== existing?.id) {
          errors.push('NOMBRE ya pertenece a otro producto activo');
        }
        const claimedRow = claimedNames.get(finalNameNormalized);
        if (claimedRow) {
          errors.push(`NOMBRE también aparece en la fila ${claimedRow}`);
        } else {
          claimedNames.set(finalNameNormalized, source.row);
        }
      }

      if (existing) {
        const targetKey = `id:${existing.id}`;
        const claimedRow = claimedTargets.get(targetKey);
        if (claimedRow) {
          errors.push(
            `El mismo producto también aparece en la fila ${claimedRow}`,
          );
        } else {
          claimedTargets.set(targetKey, source.row);
        }
      }

      let action: SpreadsheetImportAction = isCreate ? 'CREATE' : 'UPDATE';
      if (existing && !this.hasChanges(existing, data)) action = 'UNCHANGED';
      const displayName = data.name || existing?.name || `Fila ${source.row}`;
      previewRows.push({
        row: source.row,
        action,
        identifier:
          existing?.id ||
          (rawCode ? (finalCode ?? normalizedInputCode) : 'AUTOMATICO'),
        displayName,
        errors,
      });
      if (!errors.length) {
        prepared.push({
          row: source.row,
          action,
          existingId: existing?.id,
          displayName,
          data,
        });
      }
    }

    return {
      ...this.files.buildPreview(previewRows),
      prepared,
    };
  }

  private setOptionalText(
    data: PreparedProductRow['data'],
    field: 'description' | 'weight' | 'additionalInfo',
    rawValue: string,
  ) {
    const value = this.files.optionalText(rawValue);
    if (value !== undefined) {
      data[field] = value ? normalizeOptionalText(value) : null;
    }
  }

  private setNumber(
    data: PreparedProductRow['data'],
    field:
      | 'purchasePrice'
      | 'priceNormal'
      | 'priceCamino'
      | 'priceEspecial'
      | 'minStock'
      | 'reserveQuantity',
    rawValue: string,
    label: string,
    errors: string[],
    required: boolean,
  ) {
    const value = this.files.number(rawValue, label, errors, { required });
    if (typeof value === 'number') data[field] = value;
  }

  private setNullableNumber(
    data: PreparedProductRow['data'],
    field: 'priceMayorista' | 'minQuantityWholesale',
    rawValue: string,
    label: string,
    errors: string[],
    integer = false,
  ) {
    const value = this.files.number(rawValue, label, errors, {
      nullable: true,
      integer,
    });
    if (value !== undefined) data[field] = value;
  }

  private hasChanges(
    existing: Record<string, unknown>,
    data: PreparedProductRow['data'],
  ) {
    return Object.entries(data).some(([key, value]) => existing[key] !== value);
  }

  private publicPreview(result: PreparedSpreadsheetImport<PreparedProductRow>) {
    return {
      valid: result.valid,
      summary: result.summary,
      rows: result.rows,
    };
  }

  private generateCode(usedCodes: Set<string>) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = `PRD-${randomBytes(6).toString('hex').toUpperCase()}`;
      if (!usedCodes.has(code)) {
        usedCodes.add(code);
        return code;
      }
    }
    throw new BadRequestException('No se pudo generar un código de producto');
  }
}
