import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { SaveBonusRuleDto, UpdateBonusRuleDto } from './bonus-rules.controller';

@Injectable()
export class BonusRulesService {
  constructor(private readonly prisma: PrismaService) {}
  list() {
    return this.prisma.bonusRule.findMany({
      include: { subCategory: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  async create(dto: SaveBonusRuleDto) {
    await this.ensureSubcategory(dto.subCategoryId);
    await this.ensureNoActiveConflict(dto.subCategoryId, dto.isActive ?? true);
    return this.prisma.bonusRule.create({ data: dto });
  }
  async update(id: string, dto: UpdateBonusRuleDto) {
    const current = await this.prisma.bonusRule.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Regla de bonificación no encontrada');
    const subCategoryId = dto.subCategoryId ?? current.subCategoryId;
    await this.ensureSubcategory(subCategoryId);
    await this.ensureNoActiveConflict(subCategoryId, dto.isActive ?? current.isActive, id);
    return this.prisma.bonusRule.update({ where: { id }, data: dto });
  }
  private async ensureSubcategory(id: string) {
    if (!id || !(await this.prisma.subCategory.findUnique({ where: { id } }))) {
      throw new BadRequestException('Subcategoría inexistente');
    }
  }
  private async ensureNoActiveConflict(subCategoryId: string, active: boolean, excludedId?: string) {
    if (!active) return;
    const conflicting = await this.prisma.bonusRule.findFirst({
      where: { subCategoryId, isActive: true, ...(excludedId ? { id: { not: excludedId } } : {}) },
    });
    if (conflicting) throw new BadRequestException('Ya existe una regla activa para esta subcategoría');
  }
}
