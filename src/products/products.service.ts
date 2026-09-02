import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DataAuditService } from '../data-protection/data-audit.service';
import { normalizeDisplayText, normalizeSearchText, requireChangeReason } from '../data-protection/data-normalization';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: DataAuditService,
  ) {}

  private normalizeProductCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private async resolveNewProductCode(
    requestedCode?: string,
  ): Promise<string> {
    if (requestedCode) {
      const code = this.normalizeProductCode(requestedCode);
      const existing = await this.prisma.product.findUnique({
        where: { code },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException(
          `Ya existe un producto con el código "${code}"`,
        );
      }

      return code;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = `PRD-${randomBytes(6).toString('hex').toUpperCase()}`;
      const existing = await this.prisma.product.findUnique({
        where: { code },
        select: { id: true },
      });

      if (!existing) return code;
    }

    throw new ConflictException(
      'No se pudo generar un código único para el producto. Intenta nuevamente.',
    );
  }

  private toResponse(product: any): ProductResponseDto {
    const {
      provider,
      category,
      subCategory,
      warehouseStocks,
      ...rest
    } = product;
    const centralStock = warehouseStocks?.[0];

    return {
      ...rest,
      centralStock: centralStock?.stock ?? 0,
      centralReservedStock:
        centralStock?.reservedStock ?? 0,
      centralAvailableStock: centralStock
        ? Math.max(
            centralStock.stock -
              centralStock.reservedStock,
            0,
          )
        : 0,
    };
  }

  private productInclude(): any {
    return {
      provider: true,
      category: true,
      subCategory: true,
      warehouseStocks: {
        where: {
          warehouse: {
            isDefault: true,
            isActive: true,
          },
        },
        select: {
          stock: true,
          reservedStock: true,
        },
        take: 1,
      },
    };
  }

  async findAll(includeInactive = false): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: this.productInclude(),
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return products.map((p) => this.toResponse(p));
  }

  async findOne(id: string, includeInactive = false): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findFirst({
      where: { id, ...(includeInactive ? {} : { isActive: true }) },
      include: this.productInclude(),
    });
    if (!product)
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    return this.toResponse(product);
  }

  // Búsqueda por código o nombre (parcial, insensible a mayúsculas)
  async search(query: string): Promise<ProductResponseDto[]> {
    const normalizedName = normalizeSearchText(query);
    const normalizedCode = this.normalizeProductCode(query);
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          {
            nameNormalized: {
              contains: normalizedName,
            },
          },
          {
            code: {
              contains: normalizedCode,
            },
          },
        ],
      },
      include: this.productInclude(),
      orderBy: { name: 'asc' },
    });
    return products.map((p) => this.toResponse(p));
  }

  // Filtrar por categoría
  async findByCategory(categoryId: string): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: { categoryId, isActive: true },
      include: this.productInclude(),
    });
    return products.map((p) => this.toResponse(p));
  }

  // Filtrar por proveedor
  async findByProvider(providerId: string): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: { providerId, isActive: true },
      include: this.productInclude(),
    });
    return products.map((p) => this.toResponse(p));
  }

  async create(
    createProductDto: CreateProductDto,
    actorId: number,
  ): Promise<ProductResponseDto> {
    // Validar que el proveedor existe
    const provider = await this.prisma.provider.findUnique({
      where: { id: createProductDto.providerId, isActive: true },
    });
    if (!provider) throw new NotFoundException('Proveedor no encontrado');

    // Validar que la categoría existe
    const category = await this.prisma.category.findUnique({
      where: { id: createProductDto.categoryId },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    // Validar que la subcategoría existe (si se proporciona)
    if (createProductDto.subCategoryId) {
      const subCategory = await this.prisma.subCategory.findUnique({
        where: { id: createProductDto.subCategoryId },
      });
      if (!subCategory)
        throw new NotFoundException('Subcategoría no encontrada');
    }

    // Verificar que no exista un producto con el mismo nombre (opcional, pero recomendado)
    const normalizedName = normalizeSearchText(createProductDto.name);
    const existing = await this.prisma.product.findFirst({
      where: { nameNormalized: normalizedName, isActive: true },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un producto con el nombre "${createProductDto.name}"`,
      );
    }

    // Si no se proporciona stock, por defecto 0
    const stock = createProductDto.stock ?? 0;
    const minStock = createProductDto.minStock ?? 0;
    const reserveQuantity = createProductDto.reserveQuantity ?? 0;
    const unit = createProductDto.unit ?? 'UNIDAD';
    const code = await this.resolveNewProductCode(createProductDto.code);

    const product = await this.prisma.product.create({
      data: {
        code,
        name: normalizeDisplayText(createProductDto.name),
        nameNormalized: normalizedName,
        description: createProductDto.description,
        providerId: createProductDto.providerId,
        categoryId: createProductDto.categoryId,
        subCategoryId: createProductDto.subCategoryId,
        weight: createProductDto.weight,
        purchasePrice: createProductDto.purchasePrice,
        priceNormal: createProductDto.priceNormal,
        priceCamino: createProductDto.priceCamino,
        priceEspecial: createProductDto.priceEspecial,
        priceMayorista: createProductDto.priceMayorista,
        minQuantityWholesale: createProductDto.minQuantityWholesale,
        stock,
        minStock,
        unit,
        reserveQuantity,
        additionalInfo: createProductDto.additionalInfo,
        imageUrl: createProductDto.imageUrl,
      },
    });
    await this.audit.record({
      userId: actorId,
      action: 'PRODUCT_CREATED',
      entityType: 'PRODUCT',
      entityId: product.id,
      after: this.toResponse(product),
    });
    return this.toResponse(product);
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    actorId: number,
  ): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product)
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);

    // Validar relaciones si se actualizan
    if (updateProductDto.providerId) {
      const provider = await this.prisma.provider.findUnique({
        where: { id: updateProductDto.providerId, isActive: true },
      });
      if (!provider) throw new NotFoundException('Proveedor no encontrado');
    }

    if (updateProductDto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: updateProductDto.categoryId },
      });
      if (!category) throw new NotFoundException('Categoría no encontrada');
    }

    if (updateProductDto.subCategoryId) {
      const subCategory = await this.prisma.subCategory.findUnique({
        where: { id: updateProductDto.subCategoryId },
      });
      if (!subCategory)
        throw new NotFoundException('Subcategoría no encontrada');
    }

    // Si se actualiza el nombre, verificar que no exista otro producto con el mismo nombre
    const normalizedName = updateProductDto.name
      ? normalizeSearchText(updateProductDto.name)
      : product.nameNormalized;

    if (updateProductDto.name) {
      const existing = await this.prisma.product.findFirst({
        where: {
          nameNormalized: normalizedName,
          isActive: true,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException(
          `Ya existe un producto con el nombre "${updateProductDto.name}"`,
        );
      }
    }

    const normalizedCode =
      updateProductDto.code !== undefined
        ? this.normalizeProductCode(updateProductDto.code)
        : product.code;
    const codeChanged = normalizedCode !== product.code;

    if (codeChanged) {
      const existingCode = await this.prisma.product.findUnique({
        where: { code: normalizedCode },
        select: { id: true },
      });

      if (existingCode && existingCode.id !== id) {
        throw new ConflictException(
          `Ya existe un producto con el código "${normalizedCode}"`,
        );
      }
    }

    const priceFields = [
      'purchasePrice',
      'priceNormal',
      'priceCamino',
      'priceEspecial',
      'priceMayorista',
    ] as const;
    const changedPrices = priceFields.filter(
      (field) =>
        updateProductDto[field] !== undefined &&
        updateProductDto[field] !== product[field],
    );
    const changeReason = changedPrices.length
      ? requireChangeReason(updateProductDto.changeReason, 'cambiar precios')
      : undefined;

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        code: codeChanged ? normalizedCode : undefined,
        name: updateProductDto.name
          ? normalizeDisplayText(updateProductDto.name)
          : undefined,
        nameNormalized: updateProductDto.name ? normalizedName : undefined,
        description: updateProductDto.description,
        providerId: updateProductDto.providerId,
        categoryId: updateProductDto.categoryId,
        subCategoryId: updateProductDto.subCategoryId,
        weight: updateProductDto.weight,
        purchasePrice: updateProductDto.purchasePrice,
        priceNormal: updateProductDto.priceNormal,
        priceCamino: updateProductDto.priceCamino,
        priceEspecial: updateProductDto.priceEspecial,
        priceMayorista: updateProductDto.priceMayorista,
        minQuantityWholesale: updateProductDto.minQuantityWholesale,
        stock: updateProductDto.stock,
        minStock: updateProductDto.minStock,
        unit: updateProductDto.unit,
        reserveQuantity: updateProductDto.reserveQuantity,
        additionalInfo: updateProductDto.additionalInfo,
        imageUrl: updateProductDto.imageUrl,
      },
    });
    await this.audit.record({
      userId: actorId,
      action: changedPrices.length
        ? 'PRODUCT_PRICES_UPDATED'
        : codeChanged
          ? 'PRODUCT_CODE_UPDATED'
          : 'PRODUCT_UPDATED',
      entityType: 'PRODUCT',
      entityId: id,
      reason: changeReason,
      before: this.toResponse(product),
      after: this.toResponse(updated),
    });
    return this.toResponse(updated);
  }

  async remove(id: string, actorId: number, reason: string) {
  const product = await this.prisma.product.findUnique({ where: { id } });
  if (!product) throw new NotFoundException('Producto no encontrado');
  if (!product.isActive) return this.toResponse(product);
  const updated = await this.prisma.product.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
    include: this.productInclude(),
  });
  await this.audit.record({
    userId: actorId,
    action: 'PRODUCT_DEACTIVATED',
    entityType: 'PRODUCT',
    entityId: id,
    reason,
    before: this.toResponse(product),
    after: this.toResponse(updated),
  });
  return this.toResponse(updated);
}

async reactivate(id: string, actorId: number, reason: string) {
  const product = await this.prisma.product.findUnique({ where: { id } });
  if (!product) throw new NotFoundException('Producto no encontrado');
  if (product.isActive) return this.toResponse(product);
  const provider = await this.prisma.provider.findFirst({
    where: { id: product.providerId, isActive: true },
  });
  if (!provider) {
    throw new BadRequestException(
      'No se puede reactivar el producto porque su proveedor está inactivo',
    );
  }
  const duplicate = await this.prisma.product.findFirst({
    where: {
      nameNormalized: product.nameNormalized,
      isActive: true,
      id: { not: id },
    },
  });
  if (duplicate) {
    throw new ConflictException(
      'Ya existe un producto activo con el mismo nombre',
    );
  }
  const updated = await this.prisma.product.update({
    where: { id },
    data: { isActive: true, deletedAt: null },
    include: this.productInclude(),
  });
  await this.audit.record({
    userId: actorId,
    action: 'PRODUCT_REACTIVATED',
    entityType: 'PRODUCT',
    entityId: id,
    reason,
    before: this.toResponse(product),
    after: this.toResponse(updated),
  });
  return this.toResponse(updated);
}

  async updatePurchasePrice(
    id: string,
    newPurchasePrice: number,
    actorId: number,
    reason: string,
  ): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    if (newPurchasePrice < 0) {
      throw new BadRequestException(
        'El precio de compra no puede ser negativo',
      );
    }

    if (product.purchasePrice <= 0) {
      const updated = await this.prisma.product.update({
        where: { id },
        data: {
          purchasePrice: newPurchasePrice,
        },
      });

      await this.audit.record({
        userId: actorId,
        action: 'PRODUCT_PURCHASE_PRICE_UPDATED',
        entityType: 'PRODUCT',
        entityId: id,
        reason,
        before: this.toResponse(product),
        after: this.toResponse(updated),
      });
      return this.toResponse(updated);
    }

    const factor = newPurchasePrice / product.purchasePrice;

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        purchasePrice: newPurchasePrice,
        priceNormal: product.priceNormal * factor,
        priceCamino: product.priceCamino * factor,
        priceEspecial: product.priceEspecial * factor,
        priceMayorista: product.priceMayorista
          ? product.priceMayorista * factor
          : undefined,
      },
    });

    await this.audit.record({
      userId: actorId,
      action: 'PRODUCT_PURCHASE_PRICE_UPDATED',
      entityType: 'PRODUCT',
      entityId: id,
      reason,
      before: this.toResponse(product),
      after: this.toResponse(updated),
    });
    return this.toResponse(updated);
  }
}
