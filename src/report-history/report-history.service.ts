import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportType } from '@prisma/client';

@Injectable()
export class ReportHistoryService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    type: ReportType;
    title: string;
    filters: any;
    pdfUrl: string;
    userId: string;
  }) {
    return this.prisma.reportHistory.create({
      data: {
        type: data.type,
        title: data.title,
        filters: data.filters,
        pdfUrl: data.pdfUrl,
        userId: data.userId,
      },
    });
  }

  async findAll(filters?: { type?: ReportType; dateFrom?: Date; dateTo?: Date }) {
    const where: any = {};
    if (filters?.type) where.type = filters.type;
    if (filters?.dateFrom) where.createdAt = { gte: filters.dateFrom };
    if (filters?.dateTo) where.createdAt = { ...where.createdAt, lte: filters.dateTo };

    return this.prisma.reportHistory.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.reportHistory.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }
}