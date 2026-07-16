import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { ClientType } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // 1. KPI
  async getKPI(filters: DashboardFiltersDto) {
    const { dateFrom, dateTo, locationId, clientType } = filters;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Construir filtros base para ventas confirmadas/pagadas
    const saleStatuses = ['CONFIRMED', 'PARTIALLY_PAID', 'PAID'];
    const whereSale: any = { status: { in: saleStatuses } };
    if (dateFrom) whereSale.date = { gte: new Date(dateFrom) };
    if (dateTo) whereSale.date = { ...whereSale.date, lte: new Date(dateTo) };
    if (locationId) whereSale.client = { locationId };
    if (clientType) whereSale.client = { type: clientType };

    // Ventas del día (hoy)
    const salesToday = await this.prisma.sale.aggregate({
      where: { ...whereSale, date: { gte: today } },
      _sum: { total: true },
    });

    // Ventas del mes (desde inicio de mes)
    const salesMonth = await this.prisma.sale.aggregate({
      where: { ...whereSale, date: { gte: startOfMonth } },
      _sum: { total: true },
    });

    // Deuda total (ventas con estado PENDING o PARTIALLY_PAID)
    const debtStatuses = ['PENDING', 'PARTIALLY_PAID'];
    const whereDebt: any = { status: { in: debtStatuses } };
    if (dateFrom) whereDebt.date = { gte: new Date(dateFrom) };
    if (dateTo) whereDebt.date = { ...whereDebt.date, lte: new Date(dateTo) };
    if (locationId) whereDebt.client = { locationId };
    if (clientType) whereDebt.client = { type: clientType };

    const totalDebt = await this.prisma.sale.aggregate({
      where: whereDebt,
      _sum: { total: true },
    });

    // Clientes activos (últimos 30 días)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeClients = await this.prisma.sale.groupBy({
      by: ['clientId'],
      where: {
        ...whereSale,
        date: { gte: thirtyDaysAgo },
      },
      _count: { clientId: true },
    });

    // Productos en stock total
    const stock = await this.prisma.product.aggregate({
      _sum: { stock: true },
    });

    // Alertas de stock (stock < minStock)
    const stockAlerts = await this.prisma.product.count({
      where: {
        stock: { lt: this.prisma.product.fields.minStock },
      },
    });

    // Cobranza del día (pagos de hoy)
    const paymentsToday = await this.prisma.payment.aggregate({
      where: {
        receivedAt: { gte: today },
      },
      _sum: { amount: true },
    });

    return {
      salesToday: salesToday._sum.total || 0,
      salesMonth: salesMonth._sum.total || 0,
      activeClients: activeClients.length,
      totalStock: stock._sum.stock || 0,
      totalDebt: totalDebt._sum.total || 0,
      collectionToday: paymentsToday._sum.amount || 0,
      stockAlerts,
    };
  }

  // 2. Tendencia de ventas (últimos N días o rango)
  async getSalesTrend(filters: DashboardFiltersDto) {
    const { dateFrom, dateTo, locationId, clientType } = filters;
    // Si no se especifica, tomamos últimos 30 días
    let startDate = dateFrom ? new Date(dateFrom) : new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = dateTo ? new Date(dateTo) : new Date();

    const sales = await this.prisma.sale.groupBy({
      by: ['date'],
      where: {
        status: { in: ['CONFIRMED', 'PARTIALLY_PAID', 'PAID'] },
        date: { gte: startDate, lte: endDate },
        ...(locationId && { client: { locationId } }),
        ...(clientType && { client: { type: clientType } }),
      },
      _sum: { total: true },
      orderBy: { date: 'asc' },
    });

    // Rellenar días faltantes con 0
    const dateMap = new Map();
    sales.forEach(item => {
      const key = item.date.toISOString().split('T')[0];
      dateMap.set(key, item._sum.total || 0);
    });

    const labels = [];
    const data = [];
    let current = new Date(startDate);
    while (current <= endDate) {
      const key = current.toISOString().split('T')[0];
      labels.push(key);
      data.push(dateMap.get(key) || 0);
      current.setDate(current.getDate() + 1);
    }

    return { labels, data };
  }

  // 3. Métodos de pago
  async getPaymentMethods(filters: DashboardFiltersDto) {
    const { dateFrom, dateTo, locationId, clientType } = filters;
    const where: any = {};
    if (dateFrom) where.receivedAt = { gte: new Date(dateFrom) };
    if (dateTo) where.receivedAt = { ...where.receivedAt, lte: new Date(dateTo) };
    if (locationId) where.client = { locationId };
    if (clientType) where.client = { type: clientType };

    const payments = await this.prisma.payment.groupBy({
      by: ['method'],
      where,
      _sum: { amount: true },
    });

    const result = {};
    payments.forEach(item => {
      result[item.method] = item._sum.amount || 0;
    });
    return result;
  }

  // 4. Top productos más vendidos
  async getTopProducts(filters: DashboardFiltersDto) {
    const { dateFrom, dateTo, locationId, clientType, productId } = filters;
    const where: any = {};
    if (dateFrom) where.sale = { date: { gte: new Date(dateFrom) } };
    if (dateTo) where.sale = { date: { ...where.sale?.date, lte: new Date(dateTo) } };
    if (locationId) where.sale = { client: { locationId } };
    if (clientType) where.sale = { client: { type: clientType } };
    if (productId) where.productId = productId;

    const top = await this.prisma.saleDetail.groupBy({
      by: ['productId'],
      where,
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });

    // Obtener nombres de productos
    const productIds = top.map(item => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const productMap = new Map(products.map(p => [p.id, p.name]));

    return top.map(item => ({
      product: productMap.get(item.productId) || 'Desconocido',
      quantity: item._sum.quantity || 0,
    }));
  }

  // 5. Distribución de clientes por tipo
  async getClientTypes() {
    const types = await this.prisma.client.groupBy({
      by: ['type'],
      _count: { type: true },
    });
    const result = {};
    types.forEach(item => {
      result[item.type] = item._count.type;
    });
    return result;
  }

  // 6. Top deudores
  async getTopDebtors(filters: DashboardFiltersDto) {
    const { dateFrom, dateTo, locationId, clientType } = filters;
    const where: any = {
      status: { in: ['PENDING', 'PARTIALLY_PAID'] },
    };
    if (dateFrom) where.date = { gte: new Date(dateFrom) };
    if (dateTo) where.date = { ...where.date, lte: new Date(dateTo) };
    if (locationId) where.client = { locationId };
    if (clientType) where.client = { type: clientType };

    const sales = await this.prisma.sale.groupBy({
      by: ['clientId'],
      where,
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 10,
    });

    // Obtener nombres de clientes y última compra
    const clientIds = sales.map(item => item.clientId);
    const clients = await this.prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, fullName: true, sales: { orderBy: { date: 'desc' }, take: 1, select: { date: true } } },
    });
    const clientMap = new Map(clients.map(c => [c.id, { name: c.fullName, lastPurchase: c.sales[0]?.date || null }]));

    return sales.map(item => ({
      clientName: clientMap.get(item.clientId)?.name || 'Desconocido',
      debt: item._sum.total || 0,
      lastPurchase: clientMap.get(item.clientId)?.lastPurchase,
    }));
  }

  // 7. Stock bajo
  async getLowStock() {
    const products = await this.prisma.product.findMany({
      where: {
        stock: { lt: this.prisma.product.fields.minStock },
      },
      select: {
        id: true,
        name: true,
        stock: true,
        minStock: true,
        category: { select: { name: true } },
      },
      orderBy: { stock: 'asc' },
    });
    return products.map(p => ({
      product: p.name,
      category: p.category?.name || 'Sin categoría',
      stock: p.stock,
      minStock: p.minStock,
    }));
  }

  // 8. Últimas ventas
  async getLastSales(filters: DashboardFiltersDto) {
    const { dateFrom, dateTo, locationId, clientType } = filters;
    const where: any = {
      status: { in: ['CONFIRMED', 'PARTIALLY_PAID', 'PAID'] },
    };
    if (dateFrom) where.date = { gte: new Date(dateFrom) };
    if (dateTo) where.date = { ...where.date, lte: new Date(dateTo) };
    if (locationId) where.client = { locationId };
    if (clientType) where.client = { type: clientType };

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        client: { select: { fullName: true } },
        payments: { select: { amount: true, method: true } },
      },
      orderBy: { date: 'desc' },
      take: 10,
    });

    return sales.map(sale => ({
      date: sale.date,
      clientName: sale.client.fullName,
      total: sale.total,
      status: sale.status,
      paymentMethods: sale.payments.map(p => p.method).join(', ') || 'Sin pago',
    }));
  }
}