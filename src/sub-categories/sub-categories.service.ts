import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubCategoryDto } from './dto/create-sub-category.dto';
import { UpdateSubCategoryDto } from './dto/update-sub-category.dto';
import { SubCategoryResponseDto } from './dto/sub-category-response.dto';

@Injectable()
export class SubCategoriesService {
  constructor(private prisma: PrismaService) {}

  private toResponse(subCategory: any): SubCategoryResponseDto {
    const { ...rest } = subCategory;
    return rest;
  }

  async findAll(): Promise<SubCategoryResponseDto[]> {
    const subCategories = await this.prisma.subCategory.findMany({
      include: {
        category: true,
      },
    });
    return subCategories.map(s => this.toResponse(s));
  }

  async findOne(id: string): Promise<SubCategoryResponseDto> {
    const subCategory = await this.prisma.subCategory.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });
    if (!subCategory) throw new NotFoundException(`Subcategoría con ID ${id} no encontrada`);
    return this.toResponse(subCategory);
  }

  async create(createSubCategoryDto: CreateSubCategoryDto): Promise<SubCategoryResponseDto> {
    // Verificar que la categoría existe
    const category = await this.prisma.category.findUnique({
      where: { id: createSubCategoryDto.categoryId },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    // Verificar que no exista una subcategoría con el mismo nombre
    const existing = await this.prisma.subCategory.findUnique({
      where: { name: createSubCategoryDto.name },
    });
    if (existing) {
      throw new ConflictException(`Ya existe una subcategoría con el nombre "${createSubCategoryDto.name}"`);
    }

    const subCategory = await this.prisma.subCategory.create({
      data: {
        name: createSubCategoryDto.name,
        categoryId: createSubCategoryDto.categoryId,
      },
    });
    return this.toResponse(subCategory);
  }

  async update(id: string, updateSubCategoryDto: UpdateSubCategoryDto): Promise<SubCategoryResponseDto> {
    const subCategory = await this.prisma.subCategory.findUnique({ where: { id } });
    if (!subCategory) throw new NotFoundException(`Subcategoría con ID ${id} no encontrada`);

    if (updateSubCategoryDto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: updateSubCategoryDto.categoryId },
      });
      if (!category) throw new NotFoundException('Categoría no encontrada');
    }

    if (updateSubCategoryDto.name) {
      const existing = await this.prisma.subCategory.findUnique({
        where: { name: updateSubCategoryDto.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Ya existe una subcategoría con el nombre "${updateSubCategoryDto.name}"`);
      }
    }

    const updated = await this.prisma.subCategory.update({
      where: { id },
      data: {
        name: updateSubCategoryDto.name,
        categoryId: updateSubCategoryDto.categoryId,
      },
    });
    return this.toResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const subCategory = await this.prisma.subCategory.findUnique({ where: { id } });
    if (!subCategory) throw new NotFoundException(`Subcategoría con ID ${id} no encontrada`);
    await this.prisma.subCategory.delete({ where: { id } });
  }

  // Método adicional: buscar subcategorías por categoría
  async findByCategory(categoryId: string): Promise<SubCategoryResponseDto[]> {
    const subCategories = await this.prisma.subCategory.findMany({
      where: { categoryId },
    });
    return subCategories.map(s => this.toResponse(s));
  }
}