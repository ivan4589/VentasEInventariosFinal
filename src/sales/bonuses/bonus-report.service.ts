import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BonusReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(dateFrom: string, dateTo: string) {
    const parse = (value:string, end:boolean) => /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(value + (end ? 'T23:59:59.999-04:00' : 'T00:00:00.000-04:00'))
      : new Date(value);
    const from = parse(dateFrom,false);
    const to = parse(dateTo,true);
    if (!dateFrom || !dateTo || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    const gifts = await this.prisma.saleBonusDetail.findMany({
      where: {
        sale: {
          status: 'CONFIRMED',
          confirmedAt: { gte: from, lte: to },
        },
      },
      include: {
        product: { select: { code: true, name: true } },
        subCategory: { select: { name: true } },
        sale: { select: { id: true, saleNumber: true, confirmedAt: true, userId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const lines = gifts.map(g => ({
      saleId: g.saleId,
      saleNumber: g.sale.saleNumber,
      confirmedAt: g.sale.confirmedAt,
      sellerId: g.sale.userId,
      productId: g.productId,
      productCode: g.product.code,
      productName: g.product.name,
      subCategoryId: g.subCategoryId,
      subCategoryName: g.subCategory.name,
      grossQuantity: g.quantity,
      returnedQuantity: g.returnedQuantity,
      netQuantity: g.quantity - g.returnedQuantity,
      unitCostSnapshot: g.unitCostSnapshot,
      netCost: Math.round((g.quantity - g.returnedQuantity) * g.unitCostSnapshot * 100) / 100,
    }));
    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      totalGifted: lines.reduce((n,l)=>n+l.grossQuantity,0),
      totalReturned: lines.reduce((n,l)=>n+l.returnedQuantity,0),
      totalNetGifted: lines.reduce((n,l)=>n+l.netQuantity,0),
      totalNetCost: Math.round(lines.reduce((n,l)=>n+l.netCost,0)*100)/100,
      lines,
    };
  }
}
