import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { SubCategoriesService } from './sub-categories.service';
import { CreateSubCategoryDto } from './dto/create-sub-category.dto';
import { UpdateSubCategoryDto } from './dto/update-sub-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('sub-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubCategoriesController {
  constructor(private readonly subCategoriesService: SubCategoriesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  findAll(@Query('categoryId') categoryId?: string) {
    if (categoryId) return this.subCategoriesService.findByCategory(categoryId);
    return this.subCategoriesService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  findOne(@Param('id') id: string) {
    return this.subCategoriesService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() createSubCategoryDto: CreateSubCategoryDto) {
    return this.subCategoriesService.create(createSubCategoryDto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() updateSubCategoryDto: UpdateSubCategoryDto) {
    return this.subCategoriesService.update(id, updateSubCategoryDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.subCategoriesService.remove(id);
  }
}