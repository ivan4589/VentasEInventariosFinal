import { Injectable } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private buildClientFilter(filters: DashboardFiltersDto) {
    const clientFilter: any = {};

    if (filters.locationId) {
      clientFilter.locationId = filters.locationId;
    }

    if (filters.clientType) {
      clientFilter.type = filters.clientType;
    }

    return Object.keys(clientFilter).length > 0 ? clientFilter : undefined;
  }

  private buildDateFilter(dateFrom?: string, dateTo?: string) {
    const dateFilter: any = {};

    if (dateFrom) {
      dateFilter.gte = new Date(dateFrom);
    }

    if (dateTo) {
      dateFilter.lte = new Date(dateTo);
    }

    return Object.keys(dateFilter).length > 0 ? dateFilter : undefined;
  }

  private buildSaleWhere(filters: DashboardFiltersDto) {
    const where: any = {
      status: $Enums.SaleStatus.CONFIRMED,
    };

    const dateFilter = this.buildDateFilter(filters.dateFrom, filters.dateTo);

    if (dateFilter) {
      where.date = dateFilter;
    }

    const clientFilter = this.buildClientFilter(filters);

    if (clientFilter) {
      where.client = clientFilter;
    }

    return where;
  }

  async getKPI(filters: DashboardFiltersDto) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const baseSaleWhere = this.buildSaleWhere(filters);

    const salesToday = await this.prisma.sale.aggregate({
      where: {
        ...baseSaleWhere,
        date: {
          gte: today,
        },
      },
      _sum: {
        total: true,
      },
    });

    const salesMonth = await this.prisma.sale.aggregate({
      where: {
        ...baseSaleWhere,
        date: {
          gte: startOfMonth,
        },
      },
      _sum: {
        total: true,
      },
    });

    const debtWhere: any = {
      status: $Enums.SaleStatus.CONFIRMED,
      paymentStatus: {
        in: [
          $Enums.PaymentStatus.PENDING,
          $Enums.PaymentStatus.PARTIALLY_PAID,
        ],
      },
    };

    const dateFilter = this.buildDateFilter(filters.dateFrom, filters.dateTo);

    if (dateFilter) {
      debtWhere.date = dateFilter;
    }

    const clientFilter = this.buildClientFilter(filters);

    if (clientFilter) {
      debtWhere.client = clientFilter;
    }

    const salesWithDebt = await this.prisma.sale.findMany({
      where: debtWhere,
      include: {
        payments: true,
      },
    });

    const totalDebt = salesWithDebt.reduce((sum, sale) => {
      const paid = sale.payments.reduce(
        (paymentSum, payment) => paymentSum + payment.amount,
        0,
      );

      return sum + Math.max(sale.total - paid, 0);
    }, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeClients = await this.prisma.sale.groupBy({
      by: ['clientId'],
      where: {
        ...baseSaleWhere,
        date: {
          gte: thirtyDaysAgo,
        },
      },
      _count: {
        clientId: true,
      },
    });

    const stock = await this.prisma.product.aggregate({
      _sum: {
        stock: true,
      },
    });

    const products = await this.prisma.product.findMany({
      select: {
        stock: true,
        minStock: true,
      },
    });

    const stockAlerts = products.filter(
      (product) => product.minStock > 0 && product.stock <= product.minStock,
    ).length;

    const paymentsToday = await this.prisma.payment.aggregate({
      where: {
        receivedAt: {
          gte: today,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return {
      salesToday: salesToday._sum.total || 0,
      salesMonth: salesMonth._sum.total || 0,
      activeClients: activeClients.length,
      totalStock: stock._sum.stock || 0,
      totalDebt,
      collectionToday: paymentsToday._sum.amount || 0,
      stockAlerts,
    };
  }

  async getSalesTrend(filters: DashboardFiltersDto) {
    const endDate = filters.dateTo ? new Date(filters.dateTo) : new Date();

    const startDate = filters.dateFrom ? new Date(filters.dateFrom) : new Date();

    if (!filters.dateFrom) {
      startDate.setDate(startDate.getDate() - 30);
    }

    const where = this.buildSaleWhere({
      ...filters,
      dateFrom: startDate.toISOString(),
      dateTo: endDate.toISOString(),
    });

    const sales = await this.prisma.sale.findMany({
      where,
      select: {
        date: true,
        total: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    const dateMap = new Map<string, number>();

    for (const sale of sales) {
      const key = sale.date.toISOString().split('T')[0];
      dateMap.set(key, (dateMap.get(key) || 0) + sale.total);
    }

    const labels: string[] = [];
    const data: number[] = [];

    const current = new Date(startDate);

    while (current <= endDate) {
      const key = current.toISOString().split('T')[0];

      labels.push(key);
      data.push(dateMap.get(key) || 0);

      current.setDate(current.getDate() + 1);
    }

    return {
      labels,
      data,
    };
  }

  async getPaymentMethods(filters: DashboardFiltersDto) {
    const where: any = {};

    const dateFilter = this.buildDateFilter(filters.dateFrom, filters.dateTo);

    if (dateFilter) {
      where.receivedAt = dateFilter;
    }

    const clientFilter = this.buildClientFilter(filters);

    if (clientFilter) {
      where.client = clientFilter;
    }

    const payments = await this.prisma.payment.groupBy({
      by: ['method'],
      where,
      _sum: {
        amount: true,
      },
    });

    const result: Record<string, number> = {
      CASH: 0,
      QR: 0,
      BANK_TRANSFER: 0,
    };

    for (const item of payments) {
      result[item.method] = item._sum.amount || 0;
    }

    return result;
  }

  async getTopProducts(filters: DashboardFiltersDto) {
    const where: any = {};

    if (filters.productId) {
      where.productId = filters.productId;
    }

    const saleFilter: any = {
      status: $Enums.SaleStatus.CONFIRMED,
    };

    const dateFilter = this.buildDateFilter(filters.dateFrom, filters.dateTo);

    if (dateFilter) {
      saleFilter.date = dateFilter;
    }

    const clientFilter = this.buildClientFilter(filters);

    if (clientFilter) {
      saleFilter.client = clientFilter;
    }

    where.sale = saleFilter;

    const top = await this.prisma.saleDetail.groupBy({
      by: ['productId'],
      where,
      _sum: {
        quantity: true,
        subtotal: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: 5,
    });

    const productIds = top.map((item) => item.productId);

    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const productMap = new Map(products.map((product) => [product.id, product.name]));

    return top.map((item) => ({
      productId: item.productId,
      product: productMap.get(item.productId) || 'Desconocido',
      quantity: item._sum.quantity || 0,
      total: item._sum.subtotal || 0,
    }));
  }

  async getClientTypes() {
    const types = await this.prisma.client.groupBy({
      by: ['type'],
      _count: {
        type: true,
      },
    });

    const result: Record<string, number> = {
      NORMAL: 0,
      ESPECIAL: 0,
      CAMINO: 0,
    };

    for (const item of types) {
      result[item.type] = item._count.type;
    }

    return result;
  }

  async getTopDebtors(filters: DashboardFiltersDto) {
    const where: any = {
      status: $Enums.SaleStatus.CONFIRMED,
      paymentStatus: {
        in: [
          $Enums.PaymentStatus.PENDING,
          $Enums.PaymentStatus.PARTIALLY_PAID,
        ],
      },
    };

    const dateFilter = this.buildDateFilter(filters.dateFrom, filters.dateTo);

    if (dateFilter) {
      where.date = dateFilter;
    }

    const clientFilter = this.buildClientFilter(filters);

    if (clientFilter) {
      where.client = clientFilter;
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        client: true,
        payments: true,
      },
      orderBy: {
        date: 'desc',
      },
    });

    const debtorMap = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        debt: number;
        lastPurchase: Date | null;
      }
    >();

    for (const sale of sales) {
      const paid = sale.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      );

      const debt = Math.max(sale.total - paid, 0);

      if (debt <= 0) {
        continue;
      }

      const current = debtorMap.get(sale.clientId);

      if (!current) {
        debtorMap.set(sale.clientId, {
          clientId: sale.clientId,
          clientName: sale.client.fullName,
          debt,
          lastPurchase: sale.date,
        });

        continue;
      }

      current.debt += debt;

      if (!current.lastPurchase || sale.date > current.lastPurchase) {
        current.lastPurchase = sale.date;
      }
    }

    return Array.from(debtorMap.values())
      .sort((a, b) => b.debt - a.debt)
      .slice(0, 10);
  }

  async getLowStock() {
    const products = await this.prisma.product.findMany({
      include: {
        category: true,
      },
      orderBy: {
        stock: 'asc',
      },
    });

    return products
      .filter(
        (product) => product.minStock > 0 && product.stock <= product.minStock,
      )
      .map((product) => ({
        productId: product.id,
        product: product.name,
        category: product.category?.name || 'Sin categoría',
        stock: product.stock,
        minStock: product.minStock,
        unit: product.unit,
      }));
  }

  async getLastSales(filters: DashboardFiltersDto) {
    const where = this.buildSaleWhere(filters);

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        client: {
          select: {
            fullName: true,
          },
        },
        payments: {
          select: {
            amount: true,
            method: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
      take: 10,
    });

    return sales.map((sale) => ({
      id: sale.id,
      saleNumber: sale.saleNumber,
      date: sale.date,
      clientName: sale.client.fullName,
      total: sale.total,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      paid: sale.payments.reduce((sum, payment) => sum + payment.amount, 0),
      paymentMethods:
        sale.payments.map((payment) => payment.method).join(', ') || 'Sin pago',
    }));
  }
}