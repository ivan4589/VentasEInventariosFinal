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
}

@Injectable()
export class ReportHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateReportHistoryInput) {
    return this.prisma.reportHistory.create({
      data: {
        type: data.type,
        title: data.title,
        parameters: JSON.stringify(data.filters || {}),
        fileUrl: data.pdfUrl,
        userId: data.userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async findAll(filters?: FindReportHistoryFilters) {
    const where: any = {};

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};

      if (filters.dateFrom) {
        where.createdAt.gte = filters.dateFrom;
      }

      if (filters.dateTo) {
        where.createdAt.lte = filters.dateTo;
      }
    }

    return this.prisma.reportHistory.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const history = await this.prisma.reportHistory.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!history) {
      throw new NotFoundException('Historial de reporte no encontrado');
    }

    return history;
  }
}