import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CreateReportHistoryInput {
  type: $Enums.ReportType;
  title: string;
  filters?: Record<string, any>;
  pdfUrl: string;
  userId: number;
}

interface FindReportHistoryFilters {
  type?: $Enums.ReportType;
  dateFrom?: Date;
  dateTo?: Date;
  userId?: number;
}

@Injectable()
export class ReportHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(history: any) {
    const { fileUrl: _internalFileUrl, ...safe } = history;
    return {
      ...safe,
      pdfUrl: `/api/documents/reports/${history.id}`,
    };
  }

  async create(data: CreateReportHistoryInput) {
    const history = await this.prisma.reportHistory.create({
      data: {
        type: data.type,
        title: data.title,
        parameters: JSON.stringify(data.filters || {}),
        fileUrl: data.pdfUrl,
        userId: data.userId,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
    return this.toResponse(history);
  }

  async findAll(filters?: FindReportHistoryFilters) {
    const where: any = {};
    if (filters?.type) where.type = filters.type;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }

    const histories = await this.prisma.reportHistory.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return histories.map((history) => this.toResponse(history));
  }

  async findOne(id: string, userId?: number) {
    const history = await this.prisma.reportHistory.findFirst({
      where: {
        id,
        ...(userId ? { userId } : {}),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
    if (!history) {
      throw new NotFoundException('Historial de reporte no encontrado');
    }
    return this.toResponse(history);
  }
}
