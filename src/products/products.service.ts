import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  private toResponse(product: any): ProductResponseDto {
    // Excluir relaciones si no se necesitan en la respuesta
    const { provider, category, subCategory, ...rest } = product;
    return rest;
  }

  async findAll(): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      include: {
        provider: true,
        category: true,
        subCategory: true,
      },
    });
    return products.map(p => this.toResponse(p));
  }

  async findOne(id: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        provider: true,
        category: true,
        subCategory: true,
      },
    });
    if (!product) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    return this.toResponse(product);
  }

  // Búsqueda por nombre (parcial, insensible a mayúsculas)
  async searchByName(name: string): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: {
        name: {
          contains: name,
          mode: 'insensitive',
        },
      },
      include: {
        provider: true,
        category: true,
        subCategory: true,
      },
    });
    return products.map(p => this.toResponse(p));
  }

  // Filtrar por categoría
  async findByCategory(categoryId: string): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: { categoryId },
      include: {
        provider: true,
        category: true,
        subCategory: true,
      },
    });
    return products.map(p => this.toResponse(p));
  }

  // Filtrar por proveedor
  async findByProvider(providerId: string): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: { providerId },
      include: {
        provider: true,
        category: true,
        subCategory: true,
      },
    });
    return products.map(p => this.toResponse(p));
  }

  async create(createProductDto: CreateProductDto): Promise<ProductResponseDto> {
    // Validar que el proveedor existe
    const provider = await this.prisma.provider.findUnique({
      where: { id: createProductDto.providerId },
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
      if (!subCategory) throw new NotFoundException('Subcategoría no encontrada');
    }

    // Verificar que no exista un producto con el mismo nombre (opcional, pero recomendado)
    const existing = await this.prisma.product.findFirst({
      where: { name: createProductDto.name },
    });
    if (existing) {
      throw new ConflictException(`Ya existe un producto con el nombre "${createProductDto.name}"`);
    }

    // Si no se proporciona stock, por defecto 0
    const stock = createProductDto.stock ?? 0;
    const minStock = createProductDto.minStock ?? 0;
    const reserveQuantity = createProductDto.reserveQuantity ?? 0;
    const unit = createProductDto.unit ?? 'UNIDAD';

    const product = await this.prisma.product.create({
      data: {
        name: createProductDto.name,
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
    return this.toResponse(product);
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException(`Producto con ID ${id} no encontrado`);

    // Validar relaciones si se actualizan
    if (updateProductDto.providerId) {
      const provider = await this.prisma.provider.findUnique({
        where: { id: updateProductDto.providerId },
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
      if (!subCategory) throw new NotFoundException('Subcategoría no encontrada');
    }

    // Si se actualiza el nombre, verificar que no exista otro producto con el mismo nombre
    if (updateProductDto.name) {
      const existing = await this.prisma.product.findFirst({
        where: {
          name: updateProductDto.name,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException(`Ya existe un producto con el nombre "${updateProductDto.name}"`);
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        name: updateProductDto.name,
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
    return this.toResponse(updated);
  }

    async remove(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    await this.prisma.product.delete({
      where: { id },
    });

    return {
      message: 'Producto eliminado correctamente',
    };
  }

  async updatePurchasePrice(
    id: string,
    newPurchasePrice: number,
  ): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    if (newPurchasePrice < 0) {
      throw new BadRequestException('El precio de compra no puede ser negativo');
    }

    if (product.purchasePrice <= 0) {
      const updated = await this.prisma.product.update({
        where: { id },
        data: {
          purchasePrice: newPurchasePrice,
        },
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

    return this.toResponse(updated);
  }
}