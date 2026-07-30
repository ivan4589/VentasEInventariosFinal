import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuthorizationActor {
  id: number;
  role: $Enums.Role;
}

const VENDOR_ANALYTICS_REPORTS = new Set([
  'sales-detail',
  'sales-by-seller',
  'top-products',
  'returns-cancellations',
  'low-stock',
  'kardex',
]);

const COLLECTOR_ANALYTICS_REPORTS = new Set(['low-stock']);

@Injectable()
export class DataScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanViewSale(saleId: string, actor: AuthorizationActor) {
    if (actor.role === $Enums.Role.ADMIN || actor.role === $Enums.Role.VENDEDOR) {
      return;
    }

    const assignment = await this.prisma.collectionAssignment.findUnique({
      where: { saleId },
      select: { assignedToId: true },
    });

    if (!assignment) {
      const exists = await this.prisma.sale.findUnique({
        where: { id: saleId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Venta no encontrada');
    }

    if (assignment?.assignedToId !== actor.id) {
      throw new ForbiddenException(
        'Solo puedes consultar ventas asignadas a tu usuario para cobranza',
      );
    }
  }

  async assertCanManageSale(saleId: string, actor: AuthorizationActor) {
    if (actor.role === $Enums.Role.ADMIN) return;
    if (actor.role !== $Enums.Role.VENDEDOR) {
      throw new ForbiddenException('Tu rol no puede modificar ventas');
    }

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: { userId: true },
    });

    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.userId !== actor.id) {
      throw new ForbiddenException(
        'Solo puedes modificar, confirmar, devolver o enviar tus propias ventas',
      );
    }
  }

  async allowedSaleIds(actor: AuthorizationActor): Promise<Set<string> | null> {
    if (actor.role === $Enums.Role.ADMIN) return null;

    const sales = await this.prisma.sale.findMany({
      where:
        actor.role === $Enums.Role.VENDEDOR
          ? { userId: actor.id }
          : {
              collectionAssignment: {
                is: { assignedToId: actor.id },
              },
            },
      select: { id: true },
    });

    return new Set(sales.map((sale) => sale.id));
  }

  async filterSalesForActor<T extends { id: string }>(
    rows: T[],
    actor: AuthorizationActor,
  ): Promise<T[]> {
    if (actor.role === $Enums.Role.ADMIN || actor.role === $Enums.Role.VENDEDOR) {
      return rows;
    }
    const allowed = await this.allowedSaleIds(actor);
    return rows.filter((row) => allowed?.has(row.id));
  }

  sanitizeSaleForActor<T extends object>(
    sale: T,
    actor: AuthorizationActor,
  ): T {
    if (actor.role !== $Enums.Role.COBRADOR) {
      return sale;
    }

    const sanitized = { ...sale } as T & Record<string, unknown>;
    delete sanitized.pdfUrl;
    delete sanitized.cancelledPdfUrl;
    delete sanitized.whatsappLastSentAt;
    delete sanitized.whatsappMessageId;
    delete sanitized.whatsappLastError;
    delete sanitized.clientWhatsAppConsent;

    return sanitized;
  }

  sanitizeSalesForActor<T extends object>(
    sales: T[],
    actor: AuthorizationActor,
  ): T[] {
    return sales.map((sale) => this.sanitizeSaleForActor(sale, actor));
  }

  async filterPaymentsForActor<T extends { saleId: string }>(
    rows: T[],
    actor: AuthorizationActor,
  ): Promise<T[]> {
    const allowed = await this.allowedSaleIds(actor);
    if (!allowed) return rows;
    return rows.filter((row) => allowed.has(row.saleId));
  }

  assertAnalyticsReportAccess(reportKey: string, role: $Enums.Role) {
    if (role === $Enums.Role.ADMIN) return;

    const allowed =
      role === $Enums.Role.VENDEDOR
        ? VENDOR_ANALYTICS_REPORTS
        : COLLECTOR_ANALYTICS_REPORTS;

    if (!allowed.has(reportKey)) {
      throw new ForbiddenException(
        'El reporte solicitado contiene información fuera del alcance de tu rol',
      );
    }
  }

  filterAnalyticsCatalog<T extends { key: string }>(
    catalog: T[],
    role: $Enums.Role,
  ): T[] {
    if (role === $Enums.Role.ADMIN) return catalog;
    const allowed =
      role === $Enums.Role.VENDEDOR
        ? VENDOR_ANALYTICS_REPORTS
        : COLLECTOR_ANALYTICS_REPORTS;
    return catalog.filter((item) => allowed.has(item.key));
  }
}
