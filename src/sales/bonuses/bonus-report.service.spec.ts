import { BadRequestException } from '@nestjs/common';
import { BonusReportService } from './bonus-report.service';

describe('BonusReportService', () => {
  const make = () => {
    const prisma: any = { saleBonusDetail: { findMany: jest.fn() } };
    return { prisma, service: new BonusReportService(prisma) };
  };

  it('interpreta un día completo con huso horario boliviano', async () => {
    const {prisma,service}=make();
    prisma.saleBonusDetail.findMany.mockResolvedValue([{
      saleId:'sale1',productId:'f1',subCategoryId:'s1',quantity:2,returnedQuantity:1,
      unitCostSnapshot:25,
      product:{code:'F01',name:'Corbata'},
      subCategory:{name:'Fideo arroba'},
      sale:{id:'sale1',saleNumber:'20261019-001',confirmedAt:new Date('2026-10-19T10:00:00Z'),userId:3},
    }]);
    const result=await service.getReport('2026-10-19','2026-10-19');
    const query=prisma.saleBonusDetail.findMany.mock.calls[0][0];
    expect(query.where.sale.confirmedAt.gte.toISOString()).toBe('2026-10-19T04:00:00.000Z');
    expect(query.where.sale.confirmedAt.lte.toISOString()).toBe('2026-10-20T03:59:59.999Z');
    expect(result.totalGifted).toBe(2);
    expect(result.totalReturned).toBe(1);
    expect(result.totalNetGifted).toBe(1);
    expect(result.totalNetCost).toBe(25);
  });

  it('rechaza intervalos invertidos o inválidos', async () => {
    const {service}=make();
    await expect(service.getReport('2026-10-20','2026-10-19')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getReport('fecha-no-valida','2026-10-19')).rejects.toBeInstanceOf(BadRequestException);
  });
});
