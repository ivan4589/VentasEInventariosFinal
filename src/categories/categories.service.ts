import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private toResponse(category: any): CategoryResponseDto {
    const { ...rest } = category;
    return rest;
  }

  async findAll(): Promise<CategoryResponseDto[]> {
    const categories = await this.prisma.category.findMany({
      include: {
        subCategories: true,
      },
    });
    return categories.map(c => this.toResponse(c));
  }

  async findOne(id: string): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        subCategories: true,
      },
    });
    if (!category) throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    return this.toResponse(category);
  }

  async create(createCategoryDto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const existing = await this.prisma.category.findUnique({
      where: { name: createCategoryDto.name },
    });
    if (existing) {
      throw new ConflictException(`Ya existe una categoría con el nombre "${createCategoryDto.name}"`);
    }

    const category = await this.prisma.category.create({
      data: {
        name: createCategoryDto.name,
      },
    });
    return this.toResponse(category);
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`Categoría con ID ${id} no encontrada`);

    if (updateCategoryDto.name) {
      const existing = await this.prisma.category.findUnique({
        where: { name: updateCategoryDto.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Ya existe una categoría con el nombre "${updateCategoryDto.name}"`);
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        name: updateCategoryDto.name,
      },
    });
    return this.toResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`Categoría con ID ${id} no encontrada`);

    // Verificar si tiene subcategorías asociadas
    const subCategoriesCount = await this.prisma.subCategory.count({
      where: { categoryId: id },
    });
    if (subCategoriesCount > 0) {
      throw new ConflictException(
        `No se puede eliminar la categoría porque tiene ${subCategoriesCount} subcategorías asociadas`
      );
    }

    await this.prisma.category.delete({ where: { id } });
  }
}