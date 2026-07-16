import { Injectable } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

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

  private startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private startOfMonth() {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }

  private daysBetween(date: Date) {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  async getKPI(filters: DashboardFiltersDto) {
    const today = this.startOfToday();
    const startOfMonth = this.startOfMonth();

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

    const salesWithDebt = await this.prisma.sale.findMany({
      where: {
        ...baseSaleWhere,
        paymentStatus: {
          in: [
            $Enums.PaymentStatus.PENDING,
            $Enums.PaymentStatus.PARTIALLY_PAID,
          ],
        },
      },
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

    const purchasesMonth = await this.prisma.purchase.aggregate({
      where: {
        status: $Enums.PurchaseStatus.RECEIVED,
        date: {
          gte: startOfMonth,
        },
      },
      _sum: {
        total: true,
      },
    });

    const pendingPurchases = await this.prisma.purchase.count({
      where: {
        status: $Enums.PurchaseStatus.PENDING,
      },
    });

    const profitSummary = await this.getProfitSummary(filters);

    return {
      salesToday: salesToday._sum.total || 0,
      salesMonth: salesMonth._sum.total || 0,
      estimatedProfit: profitSummary.estimatedProfit,
      profitMargin: profitSummary.profitMargin,
      activeClients: activeClients.length,
      totalStock: stock._sum.stock || 0,
      totalDebt,
      collectionToday: paymentsToday._sum.amount || 0,
      purchasesMonth: purchasesMonth._sum.total || 0,
      pendingPurchases,
      stockAlerts,
    };
  }

  async getProfitSummary(filters: DashboardFiltersDto) {
    const where = this.buildSaleWhere(filters);

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    let totalRevenue = 0;
    let totalCost = 0;
    let totalUnitsSold = 0;

    for (const sale of sales) {
      totalRevenue += sale.total;

      for (const detail of sale.details) {
        totalUnitsSold += detail.quantity;
        totalCost += detail.quantity * detail.product.purchasePrice;
      }
    }

    const estimatedProfit = totalRevenue - totalCost;

    const profitMargin =
      totalRevenue > 0 ? Number(((estimatedProfit / totalRevenue) * 100).toFixed(2)) : 0;

    const averageTicket =
      sales.length > 0 ? Number((totalRevenue / sales.length).toFixed(2)) : 0;

    return {
      totalSales: sales.length,
      totalRevenue,
      totalCost,
      estimatedProfit,
      profitMargin,
      totalUnitsSold,
      averageTicket,
      generatedAt: new Date(),
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

    const productMap = new Map(
      products.map((product) => [product.id, product.name]),
    );

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
    const debtAlerts = await this.getDebtAlerts(filters);
    return debtAlerts.slice(0, 10);
  }

  async getDebtAlerts(filters: DashboardFiltersDto) {
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
        client: {
          include: {
            location: true,
          },
        },
        payments: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    const debtorMap = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        location: string;
        totalDebt: number;
        totalSales: number;
        oldestDebtDate: Date;
        daysWithoutPayment: number;
        riskLevel: string;
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

      const existing = debtorMap.get(sale.clientId);

      if (!existing) {
        debtorMap.set(sale.clientId, {
          clientId: sale.clientId,
          clientName: sale.client.fullName,
          location: sale.client.location?.name || '-',
          totalDebt: debt,
          totalSales: 1,
          oldestDebtDate: sale.date,
          daysWithoutPayment: this.daysBetween(sale.date),
          riskLevel: 'BAJO',
        });

        continue;
      }

      existing.totalDebt += debt;
      existing.totalSales += 1;

      if (sale.date < existing.oldestDebtDate) {
        existing.oldestDebtDate = sale.date;
        existing.daysWithoutPayment = this.daysBetween(sale.date);
      }
    }

    const result = Array.from(debtorMap.values()).map((debtor) => {
      let riskLevel = 'BAJO';

      if (debtor.totalDebt >= 1000 || debtor.daysWithoutPayment >= 30) {
        riskLevel = 'ALTO';
      } else if (debtor.totalDebt >= 500 || debtor.daysWithoutPayment >= 15) {
        riskLevel = 'MEDIO';
      }

      return {
        ...debtor,
        riskLevel,
      };
    });

    return result.sort((a, b) => b.totalDebt - a.totalDebt);
  }

  async getLowStock() {
    const products = await this.prisma.product.findMany({
      include: {
        category: true,
        provider: true,
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
        provider: product.provider?.companyName || '-',
        stock: product.stock,
        minStock: product.minStock,
        unit: product.unit,
        missingQuantity: Math.max(product.minStock - product.stock, 0),
      }));
  }

  async getLastSales(filters: DashboardFiltersDto) {
    const where = this.buildSaleWhere(filters);

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        client: {
          include: {
            location: true,
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
      location: sale.client.location?.name || '-',
      total: sale.total,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      paid: sale.payments.reduce((sum, payment) => sum + payment.amount, 0),
      balance:
        sale.total -
        sale.payments.reduce((sum, payment) => sum + payment.amount, 0),
      paymentMethods:
        sale.payments.map((payment) => payment.method).join(', ') || 'Sin pago',
    }));
  }

  async getPendingPurchases() {
    const purchases = await this.prisma.purchase.findMany({
      where: {
        status: $Enums.PurchaseStatus.PENDING,
      },
      include: {
        provider: true,
        user: true,
        details: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    return purchases.map((purchase) => ({
      purchaseId: purchase.id,
      provider: purchase.provider.companyName,
      registeredBy: purchase.user.name,
      date: purchase.date,
      daysPending: this.daysBetween(purchase.date),
      total: purchase.total,
      detailsCount: purchase.details.length,
      observations: purchase.observations,
    }));
  }

  async getPurchasesSummary(filters: DashboardFiltersDto) {
    const dateFilter = this.buildDateFilter(filters.dateFrom, filters.dateTo);

    const whereReceived: any = {
      status: $Enums.PurchaseStatus.RECEIVED,
    };

    const wherePending: any = {
      status: $Enums.PurchaseStatus.PENDING,
    };

    if (dateFilter) {
      whereReceived.date = dateFilter;
      wherePending.date = dateFilter;
    }

    const received = await this.prisma.purchase.aggregate({
      where: whereReceived,
      _sum: {
        total: true,
      },
      _count: {
        id: true,
      },
    });

    const pending = await this.prisma.purchase.aggregate({
      where: wherePending,
      _sum: {
        total: true,
      },
      _count: {
        id: true,
      },
    });

    const byProvider = await this.prisma.purchase.groupBy({
      by: ['providerId'],
      where: whereReceived,
      _sum: {
        total: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          total: 'desc',
        },
      },
      take: 5,
    });

    const providerIds = byProvider.map((item) => item.providerId);

    const providers = await this.prisma.provider.findMany({
      where: {
        id: {
          in: providerIds,
        },
      },
      select: {
        id: true,
        companyName: true,
      },
    });

    const providerMap = new Map(
      providers.map((provider) => [provider.id, provider.companyName]),
    );

    return {
      receivedPurchases: received._count.id,
      receivedTotal: received._sum.total || 0,
      pendingPurchases: pending._count.id,
      pendingTotal: pending._sum.total || 0,
      topProviders: byProvider.map((item) => ({
        providerId: item.providerId,
        provider: providerMap.get(item.providerId) || 'Desconocido',
        total: item._sum.total || 0,
        purchases: item._count.id,
      })),
    };
  }

  async getProductRotation(filters: DashboardFiltersDto) {
    const saleFilter: any = {
      status: $Enums.SaleStatus.CONFIRMED,
    };

    const endDate = filters.dateTo ? new Date(filters.dateTo) : new Date();
    const startDate = filters.dateFrom ? new Date(filters.dateFrom) : new Date();

    if (!filters.dateFrom) {
      startDate.setDate(startDate.getDate() - 30);
    }

    saleFilter.date = {
      gte: startDate,
      lte: endDate,
    };

    const clientFilter = this.buildClientFilter(filters);

    if (clientFilter) {
      saleFilter.client = clientFilter;
    }

    const where: any = {
      sale: saleFilter,
    };

    if (filters.productId) {
      where.productId = filters.productId;
    }

    const details = await this.prisma.saleDetail.findMany({
      where,
      include: {
        sale: true,
        product: {
          include: {
            category: true,
          },
        },
      },
    });

    const productMap = new Map<
      string,
      {
        productId: string;
        product: string;
        category: string;
        quantitySold: number;
        totalSold: number;
        currentStock: number;
        lastSale: Date | null;
      }
    >();

    for (const detail of details) {
      const current = productMap.get(detail.productId);

      if (!current) {
        productMap.set(detail.productId, {
          productId: detail.productId,
          product: detail.product.name,
          category: detail.product.category?.name || 'Sin categoría',
          quantitySold: detail.quantity,
          totalSold: detail.subtotal,
          currentStock: detail.product.stock,
          lastSale: detail.sale.date,
        });

        continue;
      }

      current.quantitySold += detail.quantity;
      current.totalSold += detail.subtotal;

      if (!current.lastSale || detail.sale.date > current.lastSale) {
        current.lastSale = detail.sale.date;
      }
    }

    const rotation = Array.from(productMap.values()).map((item) => {
      let rotationLevel = 'BAJA';

      if (item.quantitySold >= 50) {
        rotationLevel = 'ALTA';
      } else if (item.quantitySold >= 15) {
        rotationLevel = 'MEDIA';
      }

      return {
        ...item,
        rotationLevel,
      };
    });

    const topMovers = [...rotation]
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 10);

    const slowMovers = [...rotation]
      .sort((a, b) => a.quantitySold - b.quantitySold)
      .slice(0, 10);

    const soldProductIds = new Set(rotation.map((item) => item.productId));

    const inactiveProducts = await this.prisma.product.findMany({
      where: {
        id: {
          notIn: Array.from(soldProductIds),
        },
        stock: {
          gt: 0,
        },
      },
      include: {
        category: true,
      },
      orderBy: {
        name: 'asc',
      },
      take: 10,
    });

    return {
      period: {
        dateFrom: startDate,
        dateTo: endDate,
      },
      topMovers,
      slowMovers,
      inactiveProducts: inactiveProducts.map((product) => ({
        productId: product.id,
        product: product.name,
        category: product.category?.name || 'Sin categoría',
        currentStock: product.stock,
        unit: product.unit,
      })),
    };
  }

  async getSalesByLocation(filters: DashboardFiltersDto) {
    const where = this.buildSaleWhere(filters);

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        client: {
          include: {
            location: true,
          },
        },
        payments: true,
      },
    });

    const locationMap = new Map<
      string,
      {
        locationId: string;
        location: string;
        salesCount: number;
        totalSales: number;
        totalPaid: number;
        totalDebt: number;
      }
    >();

    for (const sale of sales) {
      const locationId = sale.client.locationId;
      const locationName = sale.client.location?.name || 'Sin localidad';

      const paid = sale.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      );

      const debt = Math.max(sale.total - paid, 0);

      const current = locationMap.get(locationId);

      if (!current) {
        locationMap.set(locationId, {
          locationId,
          location: locationName,
          salesCount: 1,
          totalSales: sale.total,
          totalPaid: paid,
          totalDebt: debt,
        });

        continue;
      }

      current.salesCount += 1;
      current.totalSales += sale.total;
      current.totalPaid += paid;
      current.totalDebt += debt;
    }

    return Array.from(locationMap.values()).sort(
      (a, b) => b.totalSales - a.totalSales,
    );
  }
}