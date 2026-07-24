import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsReportFiltersDto } from './dto/analytics-report-filters.dto';
import {
  ANALYTICS_REPORT_KEYS,
  AnalyticsReportCatalogItem,
  AnalyticsReportDocument,
  AnalyticsReportKey,
  ReportColumn,
  ReportFormat,
  ReportMetric,
  ReportSection,
  ReportTable,
  ReportValue,
} from './analytics-report.types';
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';

interface ReportActor {
  id: number;
  role: $Enums.Role;
}

const CATALOG: AnalyticsReportCatalogItem[] = [
  {
    key: 'inventory-valuation',
    title: 'Valorización de inventarios',
    description:
      'Existencias de Central y Depósito por proveedor y categoría, con costo promedio ponderado.',
    category: 'PRINCIPAL',
    adminOnly: true,
    requiresDateRange: false,
  },
  {
    key: 'sales-detail',
    title: 'Ventas por cliente',
    description:
      'Ventas y productos entregados a cada cliente dentro del periodo.',
    category: 'PRINCIPAL',
    adminOnly: false,
    requiresDateRange: true,
    defaultSaleStatus: 'CONFIRMED',
  },
  {
    key: 'collections',
    title: 'Cobranzas',
    description:
      'Pagos recibidos y totales por efectivo, transferencia bancaria y QR.',
    category: 'PRINCIPAL',
    adminOnly: false,
    requiresDateRange: true,
  },
  {
    key: 'accounts-receivable',
    title: 'Cuentas por cobrar',
    description:
      'Deudas por cliente, pagos parciales, saldos, vencimientos y responsables.',
    category: 'COBRANZA',
    adminOnly: false,
    requiresDateRange: false,
  },
  {
    key: 'low-stock',
    title: 'Stock bajo y agotado',
    description:
      'Productos que alcanzaron o bajaron de su mínimo, separados por almacén.',
    category: 'INVENTARIO',
    adminOnly: false,
    requiresDateRange: false,
  },
  {
    key: 'kardex',
    title: 'Kardex de productos',
    description:
      'Entradas, salidas, transferencias, ventas, devoluciones y saldos.',
    category: 'INVENTARIO',
    adminOnly: false,
    requiresDateRange: true,
  },
  {
    key: 'purchases-by-provider',
    title: 'Compras por proveedor',
    description:
      'Compras recibidas, cantidades, costos y totales por proveedor.',
    category: 'GESTION',
    adminOnly: true,
    requiresDateRange: true,
  },
  {
    key: 'sales-by-seller',
    title: 'Ventas por vendedor',
    description:
      'Cantidad de ventas, monto total y promedio por cada vendedor.',
    category: 'VENTAS',
    adminOnly: false,
    requiresDateRange: true,
  },
  {
    key: 'top-products',
    title: 'Productos más vendidos',
    description:
      'Clasificación de productos por cantidad vendida y dinero generado.',
    category: 'VENTAS',
    adminOnly: false,
    requiresDateRange: true,
  },
  {
    key: 'warehouse-transfers',
    title: 'Transferencias entre almacenes',
    description:
      'Historial de transferencias, productos, responsables y estados.',
    category: 'INVENTARIO',
    adminOnly: false,
    requiresDateRange: true,
  },
  {
    key: 'estimated-profit',
    title: 'Ganancia estimada',
    description:
      'Ingresos menos el costo promedio ponderado actual de los productos vendidos.',
    category: 'GESTION',
    adminOnly: true,
    requiresDateRange: true,
  },
  {
    key: 'returns-cancellations',
    title: 'Devoluciones y ventas anuladas',
    description: 'Productos devueltos y ventas anuladas dentro del periodo.',
    category: 'VENTAS',
    adminOnly: false,
    requiresDateRange: true,
  },
  {
    key: 'general-summary',
    title: 'Resumen general',
    description:
      'Ventas, cobranzas, saldos pendientes e inventario actual en una sola vista.',
    category: 'GESTION',
    adminOnly: false,
    requiresDateRange: true,
  },
];

@Injectable()
export class AnalyticsReportsService {
  constructor(private readonly prisma: PrismaService) {}

  getCatalog(role: $Enums.Role): AnalyticsReportCatalogItem[] {
    return CATALOG.filter(
      (item) => !item.adminOnly || role === $Enums.Role.ADMIN,
    );
  }

  async getReport(
    key: string,
    filters: AnalyticsReportFiltersDto,
    actor: ReportActor,
  ): Promise<AnalyticsReportDocument> {
    const reportKey = this.validateAccess(key, actor.role);

    switch (reportKey) {
      case 'inventory-valuation':
        return this.inventoryValuation();
      case 'sales-detail':
        return this.salesDetail(filters);
      case 'collections':
        return this.collections(filters);
      case 'accounts-receivable':
        return this.accountsReceivable(filters);
      case 'low-stock':
        return this.lowStock(filters);
      case 'kardex':
        return this.kardex(filters);
      case 'purchases-by-provider':
        return this.purchasesByProvider(filters);
      case 'sales-by-seller':
        return this.salesBySeller(filters);
      case 'top-products':
        return this.topProducts(filters);
      case 'warehouse-transfers':
        return this.warehouseTransfers(filters);
      case 'estimated-profit':
        return this.estimatedProfit(filters);
      case 'returns-cancellations':
        return this.returnsAndCancellations(filters);
      case 'general-summary':
        return this.generalSummary(filters);
    }
  }

  async generatePdf(
    key: string,
    filters: AnalyticsReportFiltersDto,
    actor: ReportActor,
  ): Promise<{ pdfUrl: string }> {
    const report = await this.getReport(key, filters, actor);
    const html = this.buildReportHtml(report);
    const pdfUrl = await this.writePdf(
      html,
      `${report.key}-${new Date().toISOString().slice(0, 10)}`,
    );

    return { pdfUrl };
  }

  private validateAccess(key: string, role: $Enums.Role): AnalyticsReportKey {
    if (!ANALYTICS_REPORT_KEYS.includes(key as AnalyticsReportKey)) {
      throw new NotFoundException('El reporte solicitado no existe');
    }

    const item = CATALOG.find((catalogItem) => catalogItem.key === key)!;

    if (item.adminOnly && role !== $Enums.Role.ADMIN) {
      throw new ForbiddenException(
        'Solo el administrador puede consultar costos y valorizaciones',
      );
    }

    return key as AnalyticsReportKey;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private roundQuantity(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }

  private productCode(productId: string): string {
    return `PROD-${productId.slice(-8).toUpperCase()}`;
  }

  private dateRange(filters: AnalyticsReportFiltersDto) {
    const parse = (value: string, endOfDay: boolean): Date => {
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
      const parsed = dateOnly
        ? new Date(
            `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-04:00`,
          )
        : new Date(value);

      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('El rango de fechas no es válido');
      }

      return parsed;
    };

    const dateFrom = filters.dateFrom
      ? parse(filters.dateFrom, false)
      : undefined;
    const dateTo = filters.dateTo ? parse(filters.dateTo, true) : undefined;

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final',
      );
    }

    return {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  private periodLabel(filters: AnalyticsReportFiltersDto): string | undefined {
    if (!filters.dateFrom && !filters.dateTo) {
      return undefined;
    }

    return `${filters.dateFrom || 'Inicio'} al ${filters.dateTo || 'Hoy'}`;
  }

  private baseDocument(
    key: AnalyticsReportKey,
    filters: AnalyticsReportFiltersDto,
    metrics: ReportMetric[],
    sections: AnalyticsReportDocument['sections'],
    emptyMessage: string,
  ): AnalyticsReportDocument {
    const item = CATALOG.find((catalogItem) => catalogItem.key === key)!;

    return {
      key,
      title: item.title,
      description: item.description,
      generatedAt: new Date(),
      periodLabel: this.periodLabel(filters),
      metrics,
      sections,
      emptyMessage,
    };
  }

  private async inventoryValuation(): Promise<AnalyticsReportDocument> {
    const stocks = await this.prisma.warehouseStock.findMany({
      where: {
        stock: { gt: 0 },
        warehouse: { isActive: true },
      },
      include: {
        warehouse: true,
        product: {
          include: {
            provider: true,
            category: true,
          },
        },
      },
      orderBy: [
        { warehouse: { name: 'asc' } },
        { product: { provider: { companyName: 'asc' } } },
        { product: { category: { name: 'asc' } } },
        { product: { name: 'asc' } },
      ],
    });

    const warehouseMap = new Map<string, typeof stocks>();
    for (const stock of stocks) {
      const current = warehouseMap.get(stock.warehouseId) || [];
      current.push(stock);
      warehouseMap.set(stock.warehouseId, current);
    }

    const sections: ReportSection[] = Array.from(warehouseMap.values()).map(
      (warehouseStocks) => {
        const warehouse = warehouseStocks[0].warehouse;
        const groupMap = new Map<string, typeof warehouseStocks>();

        for (const stock of warehouseStocks) {
          const groupKey = `${stock.product.providerId}:${stock.product.categoryId}`;
          const current = groupMap.get(groupKey) || [];
          current.push(stock);
          groupMap.set(groupKey, current);
        }

        const tables: ReportTable[] = Array.from(groupMap.values()).map(
          (group) => {
            const provider = group[0].product.provider.companyName;
            const category = group[0].product.category.name;
            const rows = group.map((item) => ({
              code: this.productCode(item.productId),
              product: item.product.name,
              stock: this.roundQuantity(item.stock),
              cost: this.roundMoney(item.product.purchasePrice),
              subtotal: this.roundMoney(
                item.stock * item.product.purchasePrice,
              ),
            }));

            return {
              title: provider,
              subtitle: category,
              columns: [
                { key: 'code', label: 'Código' },
                { key: 'product', label: 'Producto' },
                {
                  key: 'stock',
                  label: 'Stock',
                  format: 'number',
                  align: 'right',
                },
                {
                  key: 'cost',
                  label: 'Costo ponderado',
                  format: 'currency',
                  align: 'right',
                },
                {
                  key: 'subtotal',
                  label: 'Subtotal',
                  format: 'currency',
                  align: 'right',
                },
              ],
              rows,
              totals: [
                {
                  product: `Subtotal ${provider} / ${category}`,
                  subtotal: this.roundMoney(
                    rows.reduce((sum, row) => sum + Number(row.subtotal), 0),
                  ),
                },
              ],
            };
          },
        );

        return {
          title: warehouse.name,
          subtitle: `Código ${warehouse.code}`,
          metrics: [
            {
              label: 'Unidades',
              value: this.roundQuantity(
                warehouseStocks.reduce((sum, item) => sum + item.stock, 0),
              ),
              format: 'number' as const,
            },
            {
              label: 'Valor',
              value: this.roundMoney(
                warehouseStocks.reduce(
                  (sum, item) => sum + item.stock * item.product.purchasePrice,
                  0,
                ),
              ),
              format: 'currency' as const,
            },
          ],
          tables,
        };
      },
    );

    const productMap = new Map<
      string,
      {
        product: (typeof stocks)[number]['product'];
        warehouses: Map<string, number>;
      }
    >();
    const warehouses = Array.from(
      new Map(
        stocks.map((stock) => [
          stock.warehouseId,
          { id: stock.warehouseId, name: stock.warehouse.name },
        ]),
      ).values(),
    );

    for (const stock of stocks) {
      const current = productMap.get(stock.productId) || {
        product: stock.product,
        warehouses: new Map<string, number>(),
      };
      current.warehouses.set(stock.warehouseId, stock.stock);
      productMap.set(stock.productId, current);
    }

    const combinedColumns: ReportColumn[] = [
      { key: 'code', label: 'Código' },
      { key: 'product', label: 'Producto' },
      {
        key: 'cost',
        label: 'Costo ponderado',
        format: 'currency',
        align: 'right',
      },
      ...warehouses.flatMap((warehouse, index) => [
        {
          key: `stock${index}`,
          label: `Stock ${warehouse.name}`,
          format: 'number' as const,
          align: 'right' as const,
        },
        {
          key: `value${index}`,
          label: `Valor ${warehouse.name}`,
          format: 'currency' as const,
          align: 'right' as const,
        },
      ]),
      {
        key: 'totalStock',
        label: 'Stock total',
        format: 'number',
        align: 'right',
      },
      {
        key: 'totalValue',
        label: 'Valor total producto',
        format: 'currency',
        align: 'right',
      },
    ];

    const combinedRows = Array.from(productMap.values())
      .sort((a, b) => a.product.name.localeCompare(b.product.name))
      .map((item) => {
        const row: Record<string, ReportValue> = {
          code: this.productCode(item.product.id),
          product: item.product.name,
          cost: this.roundMoney(item.product.purchasePrice),
        };
        let totalStock = 0;

        warehouses.forEach((warehouse, index) => {
          const stock = item.warehouses.get(warehouse.id) || 0;
          row[`stock${index}`] = this.roundQuantity(stock);
          row[`value${index}`] = this.roundMoney(
            stock * item.product.purchasePrice,
          );
          totalStock += stock;
        });

        row.totalStock = this.roundQuantity(totalStock);
        row.totalValue = this.roundMoney(
          totalStock * item.product.purchasePrice,
        );
        return row;
      });

    sections.push({
      title: 'Consolidado por producto',
      subtitle: 'Suma del valor del mismo producto en todos los almacenes.',
      tables: [
        {
          title: 'Total combinado',
          columns: combinedColumns,
          rows: combinedRows,
          totals: [
            {
              product: 'VALOR TOTAL GENERAL',
              totalStock: this.roundQuantity(
                combinedRows.reduce(
                  (sum, row) => sum + Number(row.totalStock),
                  0,
                ),
              ),
              totalValue: this.roundMoney(
                combinedRows.reduce(
                  (sum, row) => sum + Number(row.totalValue),
                  0,
                ),
              ),
            },
          ],
        },
      ],
    });

    return this.baseDocument(
      'inventory-valuation',
      {},
      [
        { label: 'Productos', value: productMap.size, format: 'number' },
        {
          label: 'Unidades en ambos almacenes',
          value: this.roundQuantity(
            stocks.reduce((sum, stock) => sum + stock.stock, 0),
          ),
          format: 'number',
        },
        {
          label: 'Valor total general',
          value: this.roundMoney(
            stocks.reduce(
              (sum, stock) => sum + stock.stock * stock.product.purchasePrice,
              0,
            ),
          ),
          format: 'currency',
        },
      ],
      sections,
      'No existen productos con stock en los almacenes.',
    );
  }

  private async salesDetail(
    filters: AnalyticsReportFiltersDto,
  ): Promise<AnalyticsReportDocument> {
    const status = filters.status || $Enums.SaleStatus.CONFIRMED;
    const range = this.dateRange(filters);
    const where: Prisma.SaleWhereInput = {
      status,
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.productId
        ? { details: { some: { productId: filters.productId } } }
        : {}),
    };

    if (Object.keys(range).length) {
      if (status === $Enums.SaleStatus.CONFIRMED) {
        where.confirmedAt = range;
      } else {
        where.date = range;
      }
    }
    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        client: true,
        user: true,
        details: { include: { product: true } },
      },
      orderBy: [{ client: { fullName: 'asc' } }, { confirmedAt: 'asc' }],
    });
    const clientMap = new Map<string, typeof sales>();

    for (const sale of sales) {
      const current = clientMap.get(sale.clientId) || [];
      current.push(sale);
      clientMap.set(sale.clientId, current);
    }

    const sections: ReportSection[] = Array.from(clientMap.values()).map(
      (clientSales) => {
        const rows = clientSales.flatMap((sale) =>
          sale.details.map((detail) => {
            const quantity = Math.max(
              detail.quantity - detail.returnedQuantity,
              0,
            );
            return {
              saleNumber: sale.saleNumber,
              confirmedAt: sale.confirmedAt || sale.date,
              seller: sale.user.name,
              product: detail.product.name,
              quantity,
              unitPrice: detail.unitPrice,
              subtotal: this.roundMoney(quantity * detail.unitPrice),
            };
          }),
        );
        const total = this.roundMoney(
          clientSales.reduce((sum, sale) => sum + sale.total, 0),
        );

        return {
          title: clientSales[0].client.fullName,
          metrics: [
            {
              label: 'Ventas',
              value: clientSales.length,
              format: 'number' as const,
            },
            {
              label: 'Total cliente',
              value: total,
              format: 'currency' as const,
            },
          ],
          tables: [
            {
              title: 'Productos vendidos',
              columns: [
                { key: 'saleNumber', label: 'N.º venta' },
                { key: 'confirmedAt', label: 'Confirmada', format: 'date' },
                { key: 'seller', label: 'Vendedor' },
                { key: 'product', label: 'Producto' },
                {
                  key: 'quantity',
                  label: 'Cantidad',
                  format: 'number',
                  align: 'right',
                },
                {
                  key: 'unitPrice',
                  label: 'Precio unitario',
                  format: 'currency',
                  align: 'right',
                },
                {
                  key: 'subtotal',
                  label: 'Subtotal',
                  format: 'currency',
                  align: 'right',
                },
              ],
              rows,
              totals: [{ product: 'TOTAL CLIENTE', subtotal: total }],
            },
          ],
        };
      },
    );

    return this.baseDocument(
      'sales-detail',
      filters,
      [
        { label: 'Ventas', value: sales.length, format: 'number' },
        { label: 'Clientes', value: clientMap.size, format: 'number' },
        {
          label: 'Total vendido',
          value: this.roundMoney(
            sales.reduce((sum, sale) => sum + sale.total, 0),
          ),
          format: 'currency',
        },
      ],
      sections,
      'No existen ventas para los filtros seleccionados.',
    );
  }

  private async collections(
    filters: AnalyticsReportFiltersDto,
  ): Promise<AnalyticsReportDocument> {
    const range = this.dateRange(filters);
    const payments = await this.prisma.payment.findMany({
      where: {
        ...(Object.keys(range).length ? { receivedAt: range } : {}),
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
      },
      include: {
        client: true,
        user: true,
        sale: true,
      },
      orderBy: { receivedAt: 'asc' },
    });
    const totals = {
      cash: 0,
      qr: 0,
      bank: 0,
    };

    for (const payment of payments) {
      if (payment.method === $Enums.PaymentMethod.CASH) {
        totals.cash += payment.amount;
      } else if (payment.method === $Enums.PaymentMethod.QR) {
        totals.qr += payment.amount;
      } else {
        totals.bank += payment.amount;
      }
    }

    const rows = payments.map((payment) => ({
      client: payment.client.fullName,
      saleNumber: payment.sale.saleNumber,
      saleDate: payment.sale.confirmedAt || payment.sale.date,
      saleTotal: payment.sale.total,
      modality:
        payment.sale.saleType === $Enums.SaleType.CREDIT
          ? 'Crédito'
          : 'Por cobrar / contado',
      status: this.paymentStatusLabel(payment.sale.paymentStatus),
      paymentDate: payment.receivedAt,
      method: this.paymentMethodLabel(payment.method),
      amount: payment.amount,
      collector: payment.user.name,
    }));

    return this.baseDocument(
      'collections',
      filters,
      [
        {
          label: 'Efectivo',
          value: this.roundMoney(totals.cash),
          format: 'currency',
        },
        {
          label: 'Transferencia',
          value: this.roundMoney(totals.bank),
          format: 'currency',
        },
        { label: 'QR', value: this.roundMoney(totals.qr), format: 'currency' },
        {
          label: 'Total cobrado',
          value: this.roundMoney(totals.cash + totals.bank + totals.qr),
          format: 'currency',
        },
      ],
      [
        {
          title: 'Pagos recibidos',
          tables: [
            {
              title: 'Detalle de cobranzas',
              columns: [
                { key: 'client', label: 'Cliente' },
                { key: 'saleNumber', label: 'N.º venta' },
                { key: 'saleDate', label: 'Fecha venta', format: 'date' },
                {
                  key: 'saleTotal',
                  label: 'Total venta',
                  format: 'currency',
                  align: 'right',
                },
                { key: 'modality', label: 'Modalidad' },
                { key: 'status', label: 'Estado', format: 'status' },
                { key: 'paymentDate', label: 'Fecha pago', format: 'date' },
                { key: 'method', label: 'Método' },
                {
                  key: 'amount',
                  label: 'Monto pagado',
                  format: 'currency',
                  align: 'right',
                },
                { key: 'collector', label: 'Registrado por' },
              ],
              rows,
              totals: [
                {
                  client: 'TOTAL COBRADO',
                  amount: this.roundMoney(
                    payments.reduce((sum, payment) => sum + payment.amount, 0),
                  ),
                },
              ],
            },
          ],
        },
      ],
      'No existen pagos recibidos en el periodo seleccionado.',
    );
  }

  private async accountsReceivable(
    filters: AnalyticsReportFiltersDto,
  ): Promise<AnalyticsReportDocument> {
    const sales = await this.prisma.sale.findMany({
      where: {
        status: $Enums.SaleStatus.CONFIRMED,
        paymentStatus: {
          in: [
            $Enums.PaymentStatus.PENDING,
            $Enums.PaymentStatus.PARTIALLY_PAID,
          ],
        },
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
      },
      include: {
        client: true,
        payments: true,
        collectionAssignment: { include: { assignedTo: true } },
      },
      orderBy: [{ client: { fullName: 'asc' } }, { dueDate: 'asc' }],
    });
    const now = new Date();
    const rows = sales.map((sale) => {
      const paid = this.roundMoney(
        sale.payments.reduce((sum, payment) => sum + payment.amount, 0),
      );
      const balance = this.roundMoney(Math.max(sale.total - paid, 0));
      const overdueDays =
        sale.dueDate && sale.dueDate < now
          ? Math.max(
              Math.floor((now.getTime() - sale.dueDate.getTime()) / 86_400_000),
              0,
            )
          : 0;
      return {
        client: sale.client.fullName,
        saleNumber: sale.saleNumber,
        saleDate: sale.confirmedAt || sale.date,
        dueDate: sale.dueDate,
        total: sale.total,
        paid,
        balance,
        status:
          overdueDays > 0
            ? 'Vencido'
            : this.paymentStatusLabel(sale.paymentStatus),
        overdueDays,
        responsible:
          sale.collectionAssignment?.assignedTo.name || 'Sin asignar',
      };
    });

    return this.baseDocument(
      'accounts-receivable',
      filters,
      [
        { label: 'Ventas pendientes', value: rows.length, format: 'number' },
        {
          label: 'Saldo total',
          value: this.roundMoney(
            rows.reduce((sum, row) => sum + row.balance, 0),
          ),
          format: 'currency',
        },
        {
          label: 'Saldo vencido',
          value: this.roundMoney(
            rows
              .filter((row) => row.overdueDays > 0)
              .reduce((sum, row) => sum + row.balance, 0),
          ),
          format: 'currency',
        },
      ],
      [
        {
          title: 'Deudas vigentes',
          tables: [
            {
              title: 'Detalle por cliente',
              columns: [
                { key: 'client', label: 'Cliente' },
                { key: 'saleNumber', label: 'N.º venta' },
                { key: 'saleDate', label: 'Fecha venta', format: 'date' },
                { key: 'dueDate', label: 'Vencimiento', format: 'date' },
                {
                  key: 'total',
                  label: 'Total',
                  format: 'currency',
                  align: 'right',
                },
                {
                  key: 'paid',
                  label: 'Pagado',
                  format: 'currency',
                  align: 'right',
                },
                {
                  key: 'balance',
                  label: 'Saldo',
                  format: 'currency',
                  align: 'right',
                },
                { key: 'status', label: 'Estado', format: 'status' },
                { key: 'overdueDays', label: 'Días atraso', format: 'number' },
                { key: 'responsible', label: 'Responsable' },
              ],
              rows,
              totals: [
                {
                  client: 'TOTAL PENDIENTE',
                  balance: this.roundMoney(
                    rows.reduce((sum, row) => sum + row.balance, 0),
                  ),
                },
              ],
            },
          ],
        },
      ],
      'No existen cuentas por cobrar.',
    );
  }

  private async lowStock(
    filters: AnalyticsReportFiltersDto,
  ): Promise<AnalyticsReportDocument> {
    const stocks = await this.prisma.warehouseStock.findMany({
      where: {
        warehouse: { isActive: true },
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      },
      include: {
        warehouse: true,
        product: { include: { provider: true, category: true } },
      },
      orderBy: [{ warehouse: { name: 'asc' } }, { product: { name: 'asc' } }],
    });
    const lowStocks = stocks.filter((item) => {
      const minimum = item.minStock > 0 ? item.minStock : item.product.minStock;
      return minimum > 0 && item.stock - item.reservedStock <= minimum;
    });
    const warehouseMap = new Map<string, typeof lowStocks>();
    for (const stock of lowStocks) {
      const current = warehouseMap.get(stock.warehouseId) || [];
      current.push(stock);
      warehouseMap.set(stock.warehouseId, current);
    }

    const sections: ReportSection[] = Array.from(warehouseMap.values()).map(
      (items) => ({
        title: items[0].warehouse.name,
        tables: [
          {
            title: 'Productos por reponer',
            columns: [
              { key: 'code', label: 'Código' },
              { key: 'product', label: 'Producto' },
              { key: 'provider', label: 'Proveedor' },
              { key: 'category', label: 'Categoría' },
              {
                key: 'stock',
                label: 'Stock',
                format: 'number',
                align: 'right',
              },
              {
                key: 'reserved',
                label: 'Reservado',
                format: 'number',
                align: 'right',
              },
              {
                key: 'available',
                label: 'Disponible',
                format: 'number',
                align: 'right',
              },
              {
                key: 'minimum',
                label: 'Mínimo',
                format: 'number',
                align: 'right',
              },
              { key: 'status', label: 'Estado', format: 'status' },
            ],
            rows: items.map((item) => {
              const minimum =
                item.minStock > 0 ? item.minStock : item.product.minStock;
              const available = item.stock - item.reservedStock;
              return {
                code: this.productCode(item.productId),
                product: item.product.name,
                provider: item.product.provider.companyName,
                category: item.product.category.name,
                stock: item.stock,
                reserved: item.reservedStock,
                available,
                minimum,
                status: available <= 0 ? 'Agotado' : 'Stock bajo',
              };
            }),
          },
        ],
      }),
    );

    return this.baseDocument(
      'low-stock',
      filters,
      [
        {
          label: 'Productos por reponer',
          value: lowStocks.length,
          format: 'number',
        },
        {
          label: 'Agotados',
          value: lowStocks.filter(
            (item) => item.stock - item.reservedStock <= 0,
          ).length,
          format: 'number',
        },
      ],
      sections,
      'No existen productos con stock bajo o agotado.',
    );
  }

  private async kardex(
    filters: AnalyticsReportFiltersDto,
  ): Promise<AnalyticsReportDocument> {
    const range = this.dateRange(filters);
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        ...(Object.keys(range).length ? { createdAt: range } : {}),
        ...(filters.productId ? { productId: filters.productId } : {}),
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      },
      include: { product: true, warehouse: true, user: true },
      orderBy: [
        { product: { name: 'asc' } },
        { warehouse: { name: 'asc' } },
        { createdAt: 'asc' },
      ],
    });
    const groupMap = new Map<string, typeof movements>();
    for (const movement of movements) {
      const key = `${movement.productId}:${movement.warehouseId}`;
      const current = groupMap.get(key) || [];
      current.push(movement);
      groupMap.set(key, current);
    }
    const sections: ReportSection[] = Array.from(groupMap.values()).map(
      (items) => ({
        title: items[0].product.name,
        subtitle: items[0].warehouse.name,
        tables: [
          {
            title: 'Movimientos',
            columns: [
              { key: 'date', label: 'Fecha', format: 'datetime' },
              { key: 'type', label: 'Movimiento' },
              {
                key: 'entry',
                label: 'Entrada',
                format: 'number',
                align: 'right',
              },
              {
                key: 'exit',
                label: 'Salida',
                format: 'number',
                align: 'right',
              },
              {
                key: 'previous',
                label: 'Saldo anterior',
                format: 'number',
                align: 'right',
              },
              {
                key: 'newStock',
                label: 'Saldo nuevo',
                format: 'number',
                align: 'right',
              },
              { key: 'reference', label: 'Referencia' },
              { key: 'user', label: 'Usuario' },
            ],
            rows: items.map((item) => {
              const isEntry = this.isEntryMovement(item.type);
              return {
                date: item.createdAt,
                type: this.movementTypeLabel(item.type),
                entry: isEntry ? item.quantity : null,
                exit: isEntry ? null : item.quantity,
                previous: item.previousStock,
                newStock: item.newStock,
                reference: item.referenceId || '-',
                user: item.user?.name || 'Sistema',
              };
            }),
          },
        ],
      }),
    );

    return this.baseDocument(
      'kardex',
      filters,
      [
        { label: 'Movimientos', value: movements.length, format: 'number' },
        {
          label: 'Entradas',
          value: this.roundQuantity(
            movements
              .filter((movement) => this.isEntryMovement(movement.type))
              .reduce((sum, movement) => sum + movement.quantity, 0),
          ),
          format: 'number',
        },
        {
          label: 'Salidas',
          value: this.roundQuantity(
            movements
              .filter((movement) => !this.isEntryMovement(movement.type))
              .reduce((sum, movement) => sum + movement.quantity, 0),
          ),
          format: 'number',
        },
      ],
      sections,
      'No existen movimientos de inventario para el periodo.',
    );
  }

  private async purchasesByProvider(
    filters: AnalyticsReportFiltersDto,
  ): Promise<AnalyticsReportDocument> {
    const range = this.dateRange(filters);
    const groups = await this.prisma.purchaseProvider.findMany({
      where: {
        status: $Enums.PurchaseProviderStatus.RECEIVED,
        ...(Object.keys(range).length ? { receivedAt: range } : {}),
      },
      include: {
        provider: true,
        purchase: true,
        details: { include: { product: true, category: true } },
      },
      orderBy: [{ provider: { companyName: 'asc' } }, { receivedAt: 'asc' }],
    });
    const providerMap = new Map<string, typeof groups>();
    for (const group of groups) {
      const current = providerMap.get(group.providerId) || [];
      current.push(group);
      providerMap.set(group.providerId, current);
    }
    const sections: ReportSection[] = Array.from(providerMap.values()).map(
      (providerGroups) => {
        const rows = providerGroups.flatMap((group) =>
          group.details.map((detail) => ({
            purchase: group.purchaseId.slice(-10).toUpperCase(),
            receivedAt: group.receivedAt,
            product: detail.product.name,
            category: detail.category.name,
            quantity: detail.quantity,
            unitPrice: detail.unitPrice,
            subtotal: detail.subtotal,
          })),
        );
        return {
          title: providerGroups[0].provider.companyName,
          metrics: [
            {
              label: 'Total proveedor',
              value: this.roundMoney(
                rows.reduce((sum, row) => sum + row.subtotal, 0),
              ),
              format: 'currency' as const,
            },
          ],
          tables: [
            {
              title: 'Compras recibidas',
              columns: [
                { key: 'purchase', label: 'Compra' },
                { key: 'receivedAt', label: 'Recibida', format: 'date' },
                { key: 'product', label: 'Producto' },
                { key: 'category', label: 'Categoría' },
                {
                  key: 'quantity',
                  label: 'Cantidad',
                  format: 'number',
                  align: 'right',
                },
                {
                  key: 'unitPrice',
                  label: 'Costo unitario',
                  format: 'currency',
                  align: 'right',
                },
                {
                  key: 'subtotal',
                  label: 'Subtotal',
                  format: 'currency',
                  align: 'right',
                },
              ],
              rows,
              totals: [
                {
                  product: 'TOTAL PROVEEDOR',
                  subtotal: this.roundMoney(
                    rows.reduce((sum, row) => sum + row.subtotal, 0),
                  ),
                },
              ],
            },
          ],
        };
      },
    );

    return this.baseDocument(
      'purchases-by-provider',
      filters,
      [
        { label: 'Proveedores', value: providerMap.size, format: 'number' },
        { label: 'Recepciones', value: groups.length, format: 'number' },
        {
          label: 'Total comprado',
          value: this.roundMoney(
            groups.reduce((sum, group) => sum + group.total, 0),
          ),
          format: 'currency',
        },
      ],
      sections,
      'No existen compras recibidas en el periodo.',
    );
  }

  private async salesBySeller(
    filters: AnalyticsReportFiltersDto,
  ): Promise<AnalyticsReportDocument> {
    const range = this.dateRange(filters);
    const sales = await this.prisma.sale.findMany({
      where: {
        status: $Enums.SaleStatus.CONFIRMED,
        ...(Object.keys(range).length ? { confirmedAt: range } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
      },
      include: { user: true },
    });
    const sellerMap = new Map<
      number,
      { name: string; count: number; total: number }
    >();
    for (const sale of sales) {
      const current = sellerMap.get(sale.userId) || {
        name: sale.user.name,
        count: 0,
        total: 0,
      };
      current.count += 1;
      current.total += sale.total;
      sellerMap.set(sale.userId, current);
    }
    const rows = Array.from(sellerMap.values())
      .sort((a, b) => b.total - a.total)
      .map((seller, index) => ({
        position: index + 1,
        seller: seller.name,
        sales: seller.count,
        total: this.roundMoney(seller.total),
        average: this.roundMoney(seller.total / seller.count),
      }));

    return this.singleTableDocument(
      'sales-by-seller',
      filters,
      [
        { label: 'Vendedores', value: rows.length, format: 'number' },
        { label: 'Ventas', value: sales.length, format: 'number' },
        {
          label: 'Total vendido',
          value: this.roundMoney(
            sales.reduce((sum, sale) => sum + sale.total, 0),
          ),
          format: 'currency',
        },
      ],
      'Rendimiento por vendedor',
      [
        { key: 'position', label: 'Posición', format: 'number' },
        { key: 'seller', label: 'Vendedor' },
        { key: 'sales', label: 'Ventas', format: 'number', align: 'right' },
        {
          key: 'total',
          label: 'Total vendido',
          format: 'currency',
          align: 'right',
        },
        {
          key: 'average',
          label: 'Promedio por venta',
          format: 'currency',
          align: 'right',
        },
      ],
      rows,
      'No existen ventas confirmadas en el periodo.',
    );
  }

  private async topProducts(
    filters: AnalyticsReportFiltersDto,
  ): Promise<AnalyticsReportDocument> {
    const range = this.dateRange(filters);
    const sales = await this.prisma.sale.findMany({
      where: {
        status: $Enums.SaleStatus.CONFIRMED,
        ...(Object.keys(range).length ? { confirmedAt: range } : {}),
      },
      include: { details: { include: { product: true } } },
    });
    const productMap = new Map<
      string,
      { name: string; quantity: number; revenue: number; sales: Set<string> }
    >();
    for (const sale of sales) {
      for (const detail of sale.details) {
        const quantity = Math.max(detail.quantity - detail.returnedQuantity, 0);
        const current = productMap.get(detail.productId) || {
          name: detail.product.name,
          quantity: 0,
          revenue: 0,
          sales: new Set<string>(),
        };
        current.quantity += quantity;
        current.revenue += quantity * detail.unitPrice;
        current.sales.add(sale.id);
        productMap.set(detail.productId, current);
      }
    }
    const rows = Array.from(productMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .map((product, index) => ({
        position: index + 1,
        product: product.name,
        quantity: this.roundQuantity(product.quantity),
        sales: product.sales.size,
        revenue: this.roundMoney(product.revenue),
      }));

    return this.singleTableDocument(
      'top-products',
      filters,
      [
        { label: 'Productos vendidos', value: rows.length, format: 'number' },
        {
          label: 'Unidades',
          value: this.roundQuantity(
            rows.reduce((sum, row) => sum + row.quantity, 0),
          ),
          format: 'number',
        },
        {
          label: 'Ingresos',
          value: this.roundMoney(
            rows.reduce((sum, row) => sum + row.revenue, 0),
          ),
          format: 'currency',
        },
      ],
      'Clasificación de productos',
      [
        { key: 'position', label: 'Posición', format: 'number' },
        { key: 'product', label: 'Producto' },
        {
          key: 'quantity',
          label: 'Cantidad vendida',
          format: 'number',
          align: 'right',
        },
        { key: 'sales', label: 'Ventas', format: 'number', align: 'right' },
        {
          key: 'revenue',
          label: 'Dinero generado',
          format: 'currency',
          align: 'right',
        },
      ],
      rows,
      'No existen productos vendidos en el periodo.',
    );
  }

  private async warehouseTransfers(
    filters: AnalyticsReportFiltersDto,
  ): Promise<AnalyticsReportDocument> {
    const range = this.dateRange(filters);
    const transfers = await this.prisma.warehouseTransfer.findMany({
      where: {
        ...(Object.keys(range).length ? { transferredAt: range } : {}),
        ...(filters.warehouseId
          ? {
              OR: [
                { originWarehouseId: filters.warehouseId },
                { destinationWarehouseId: filters.warehouseId },
              ],
            }
          : {}),
      },
      include: {
        originWarehouse: true,
        destinationWarehouse: true,
        user: true,
        details: { include: { product: true } },
      },
      orderBy: { transferredAt: 'asc' },
    });
    const rows = transfers.flatMap((transfer) =>
      transfer.details.map((detail) => ({
        number: transfer.transferNumber,
        date: transfer.transferredAt,
        origin: transfer.originWarehouse.name,
        destination: transfer.destinationWarehouse.name,
        product: detail.product.name,
        quantity: detail.quantity,
        responsible: transfer.user.name,
        status:
          transfer.status === $Enums.WarehouseTransferStatus.COMPLETED
            ? 'Completada'
            : 'Anulada',
      })),
    );

    return this.singleTableDocument(
      'warehouse-transfers',
      filters,
      [
        { label: 'Transferencias', value: transfers.length, format: 'number' },
        { label: 'Productos movidos', value: rows.length, format: 'number' },
        {
          label: 'Unidades transferidas',
          value: this.roundQuantity(
            rows.reduce((sum, row) => sum + row.quantity, 0),
          ),
          format: 'number',
        },
      ],
      'Historial de transferencias',
      [
        { key: 'number', label: 'N.º transferencia' },
        { key: 'date', label: 'Fecha', format: 'datetime' },
        { key: 'origin', label: 'Origen' },
        { key: 'destination', label: 'Destino' },
        { key: 'product', label: 'Producto' },
        {
          key: 'quantity',
          label: 'Cantidad',
          format: 'number',
          align: 'right',
        },
        { key: 'responsible', label: 'Responsable' },
        { key: 'status', label: 'Estado', format: 'status' },
      ],
      rows,
      'No existen transferencias en el periodo.',
    );
  }

  private async estimatedProfit(
    filters: AnalyticsReportFiltersDto,
  ): Promise<AnalyticsReportDocument> {
    const range = this.dateRange(filters);
    const sales = await this.prisma.sale.findMany({
      where: {
        status: $Enums.SaleStatus.CONFIRMED,
        ...(Object.keys(range).length ? { confirmedAt: range } : {}),
      },
      include: {
        details: { include: { product: true } },
      },
    });
    const productMap = new Map<
      string,
      {
        name: string;
        quantity: number;
        revenue: number;
        cost: number;
      }
    >();
    for (const sale of sales) {
      for (const detail of sale.details) {
        const quantity = Math.max(detail.quantity - detail.returnedQuantity, 0);
        const current = productMap.get(detail.productId) || {
          name: detail.product.name,
          quantity: 0,
          revenue: 0,
          cost: 0,
        };
        current.quantity += quantity;
        current.revenue += quantity * detail.unitPrice;
        current.cost += quantity * detail.product.purchasePrice;
        productMap.set(detail.productId, current);
      }
    }
    const rows = Array.from(productMap.values())
      .map((product) => ({
        product: product.name,
        quantity: this.roundQuantity(product.quantity),
        revenue: this.roundMoney(product.revenue),
        cost: this.roundMoney(product.cost),
        profit: this.roundMoney(product.revenue - product.cost),
        margin:
          product.revenue > 0
            ? this.roundMoney(
                ((product.revenue - product.cost) / product.revenue) * 100,
              )
            : 0,
      }))
      .sort((a, b) => b.profit - a.profit);
    const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const cost = rows.reduce((sum, row) => sum + row.cost, 0);

    return this.singleTableDocument(
      'estimated-profit',
      filters,
      [
        {
          label: 'Ingresos',
          value: this.roundMoney(revenue),
          format: 'currency',
        },
        {
          label: 'Costo estimado',
          value: this.roundMoney(cost),
          format: 'currency',
        },
        {
          label: 'Ganancia estimada',
          value: this.roundMoney(revenue - cost),
          format: 'currency',
        },
      ],
      'Ganancia por producto',
      [
        { key: 'product', label: 'Producto' },
        {
          key: 'quantity',
          label: 'Cantidad',
          format: 'number',
          align: 'right',
        },
        {
          key: 'revenue',
          label: 'Ingresos',
          format: 'currency',
          align: 'right',
        },
        { key: 'cost', label: 'Costo', format: 'currency', align: 'right' },
        {
          key: 'profit',
          label: 'Ganancia',
          format: 'currency',
          align: 'right',
        },
        { key: 'margin', label: 'Margen %', format: 'number', align: 'right' },
      ],
      rows,
      'No existen ventas para estimar ganancias en el periodo.',
    );
  }

  private async returnsAndCancellations(
    filters: AnalyticsReportFiltersDto,
  ): Promise<AnalyticsReportDocument> {
    const range = this.dateRange(filters);
    const [returns, cancellations] = await Promise.all([
      this.prisma.saleReturn.findMany({
        where: Object.keys(range).length ? { createdAt: range } : {},
        include: {
          sale: { include: { client: true } },
          user: true,
          details: { include: { product: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.sale.findMany({
        where: {
          status: $Enums.SaleStatus.CANCELLED,
          ...(Object.keys(range).length ? { cancelledAt: range } : {}),
        },
        include: { client: true, user: true },
        orderBy: { cancelledAt: 'asc' },
      }),
    ]);
    const returnRows = returns.flatMap((saleReturn) =>
      saleReturn.details.map((detail) => ({
        date: saleReturn.createdAt,
        saleNumber: saleReturn.sale.saleNumber,
        client: saleReturn.sale.client.fullName,
        product: detail.product.name,
        quantity: detail.quantity,
        amount: detail.subtotal,
        registeredBy: saleReturn.user.name,
      })),
    );
    const cancellationRows = cancellations.map((sale) => ({
      date: sale.cancelledAt || sale.updatedAt,
      saleNumber: sale.saleNumber,
      client: sale.client.fullName,
      amount: sale.total,
      seller: sale.user.name,
    }));

    return this.baseDocument(
      'returns-cancellations',
      filters,
      [
        { label: 'Devoluciones', value: returns.length, format: 'number' },
        {
          label: 'Monto devuelto',
          value: this.roundMoney(
            returns.reduce((sum, saleReturn) => sum + saleReturn.amount, 0),
          ),
          format: 'currency',
        },
        {
          label: 'Ventas anuladas',
          value: cancellations.length,
          format: 'number',
        },
        {
          label: 'Monto anulado',
          value: this.roundMoney(
            cancellations.reduce((sum, sale) => sum + sale.total, 0),
          ),
          format: 'currency',
        },
      ],
      [
        {
          title: 'Devoluciones',
          tables: [
            {
              title: 'Productos devueltos',
              columns: [
                { key: 'date', label: 'Fecha', format: 'date' },
                { key: 'saleNumber', label: 'N.º venta' },
                { key: 'client', label: 'Cliente' },
                { key: 'product', label: 'Producto' },
                {
                  key: 'quantity',
                  label: 'Cantidad',
                  format: 'number',
                  align: 'right',
                },
                {
                  key: 'amount',
                  label: 'Monto',
                  format: 'currency',
                  align: 'right',
                },
                { key: 'registeredBy', label: 'Registrado por' },
              ],
              rows: returnRows,
            },
          ],
        },
        {
          title: 'Ventas anuladas',
          tables: [
            {
              title: 'Anulaciones',
              columns: [
                { key: 'date', label: 'Fecha', format: 'date' },
                { key: 'saleNumber', label: 'N.º venta' },
                { key: 'client', label: 'Cliente' },
                {
                  key: 'amount',
                  label: 'Monto',
                  format: 'currency',
                  align: 'right',
                },
                { key: 'seller', label: 'Vendedor' },
              ],
              rows: cancellationRows,
            },
          ],
        },
      ],
      'No existen devoluciones ni ventas anuladas en el periodo.',
    );
  }

  private async generalSummary(
    filters: AnalyticsReportFiltersDto,
  ): Promise<AnalyticsReportDocument> {
    const range = this.dateRange(filters);
    const [sales, payments, debts, stocks] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          status: $Enums.SaleStatus.CONFIRMED,
          ...(Object.keys(range).length ? { confirmedAt: range } : {}),
        },
        include: {
          details: { include: { product: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: Object.keys(range).length ? { receivedAt: range } : {},
      }),
      this.prisma.sale.findMany({
        where: {
          status: $Enums.SaleStatus.CONFIRMED,
          paymentStatus: {
            in: [
              $Enums.PaymentStatus.PENDING,
              $Enums.PaymentStatus.PARTIALLY_PAID,
            ],
          },
        },
        include: { client: true, payments: true },
      }),
      this.prisma.warehouseStock.findMany({
        where: { stock: { gt: 0 }, warehouse: { isActive: true } },
        include: { warehouse: true },
      }),
    ]);
    const totalSales = this.roundMoney(
      sales.reduce((sum, sale) => sum + sale.total, 0),
    );
    const totalCollected = this.roundMoney(
      payments.reduce((sum, payment) => sum + payment.amount, 0),
    );
    const totalDebt = this.roundMoney(
      debts.reduce(
        (sum, sale) =>
          sum +
          Math.max(
            sale.total -
              sale.payments.reduce(
                (paymentSum, payment) => paymentSum + payment.amount,
                0,
              ),
            0,
          ),
        0,
      ),
    );
    const warehouseMap = new Map<string, number>();
    for (const stock of stocks) {
      warehouseMap.set(
        stock.warehouse.name,
        (warehouseMap.get(stock.warehouse.name) || 0) + stock.stock,
      );
    }
    const topProducts = new Map<string, { name: string; quantity: number }>();
    for (const sale of sales) {
      for (const detail of sale.details) {
        const current = topProducts.get(detail.productId) || {
          name: detail.product.name,
          quantity: 0,
        };
        current.quantity += Math.max(
          detail.quantity - detail.returnedQuantity,
          0,
        );
        topProducts.set(detail.productId, current);
      }
    }

    return this.baseDocument(
      'general-summary',
      filters,
      [
        { label: 'Total vendido', value: totalSales, format: 'currency' },
        { label: 'Total cobrado', value: totalCollected, format: 'currency' },
        { label: 'Deuda actual', value: totalDebt, format: 'currency' },
        { label: 'Ventas confirmadas', value: sales.length, format: 'number' },
      ],
      [
        {
          title: 'Inventario actual',
          tables: [
            {
              title: 'Stock por almacén',
              columns: [
                { key: 'warehouse', label: 'Almacén' },
                {
                  key: 'stock',
                  label: 'Stock actual',
                  format: 'number',
                  align: 'right',
                },
              ],
              rows: Array.from(warehouseMap.entries()).map(
                ([warehouse, stock]) => ({
                  warehouse,
                  stock: this.roundQuantity(stock),
                }),
              ),
            },
          ],
        },
        {
          title: 'Productos destacados',
          tables: [
            {
              title: 'Más vendidos del periodo',
              columns: [
                { key: 'product', label: 'Producto' },
                {
                  key: 'quantity',
                  label: 'Cantidad',
                  format: 'number',
                  align: 'right',
                },
              ],
              rows: Array.from(topProducts.values())
                .sort((a, b) => b.quantity - a.quantity)
                .slice(0, 10)
                .map((product) => ({
                  product: product.name,
                  quantity: this.roundQuantity(product.quantity),
                })),
            },
          ],
        },
        {
          title: 'Métodos de pago',
          tables: [
            {
              title: 'Cobrado por método',
              columns: [
                { key: 'method', label: 'Método' },
                {
                  key: 'amount',
                  label: 'Monto',
                  format: 'currency',
                  align: 'right',
                },
              ],
              rows: [
                {
                  method: 'Efectivo',
                  amount: this.roundMoney(
                    payments
                      .filter(
                        (payment) =>
                          payment.method === $Enums.PaymentMethod.CASH,
                      )
                      .reduce((sum, payment) => sum + payment.amount, 0),
                  ),
                },
                {
                  method: 'Transferencia bancaria',
                  amount: this.roundMoney(
                    payments
                      .filter(
                        (payment) =>
                          payment.method === $Enums.PaymentMethod.BANK_TRANSFER,
                      )
                      .reduce((sum, payment) => sum + payment.amount, 0),
                  ),
                },
                {
                  method: 'QR',
                  amount: this.roundMoney(
                    payments
                      .filter(
                        (payment) => payment.method === $Enums.PaymentMethod.QR,
                      )
                      .reduce((sum, payment) => sum + payment.amount, 0),
                  ),
                },
              ],
            },
          ],
        },
      ],
      'No existe información para generar el resumen.',
    );
  }

  private singleTableDocument(
    key: AnalyticsReportKey,
    filters: AnalyticsReportFiltersDto,
    metrics: ReportMetric[],
    tableTitle: string,
    columns: ReportColumn[],
    rows: Array<Record<string, ReportValue>>,
    emptyMessage: string,
  ): AnalyticsReportDocument {
    return this.baseDocument(
      key,
      filters,
      metrics,
      [{ title: tableTitle, tables: [{ title: 'Detalle', columns, rows }] }],
      emptyMessage,
    );
  }

  private paymentMethodLabel(method: $Enums.PaymentMethod): string {
    if (method === $Enums.PaymentMethod.CASH) return 'Efectivo';
    if (method === $Enums.PaymentMethod.QR) return 'QR';
    return 'Transferencia bancaria';
  }

  private paymentStatusLabel(status: $Enums.PaymentStatus): string {
    if (status === $Enums.PaymentStatus.PAID) return 'Pagado';
    if (status === $Enums.PaymentStatus.PARTIALLY_PAID) return 'Pago parcial';
    return 'Pendiente';
  }

  private isEntryMovement(type: $Enums.InventoryMovementType): boolean {
    const entryTypes: $Enums.InventoryMovementType[] = [
      $Enums.InventoryMovementType.INITIAL_STOCK,
      $Enums.InventoryMovementType.PURCHASE_IN,
      $Enums.InventoryMovementType.SALE_RETURN_IN,
      $Enums.InventoryMovementType.TRANSFER_IN,
      $Enums.InventoryMovementType.TRANSFER_CANCEL_IN,
      $Enums.InventoryMovementType.ADJUSTMENT_IN,
    ];
    return entryTypes.includes(type);
  }

  private movementTypeLabel(type: $Enums.InventoryMovementType): string {
    const labels: Record<$Enums.InventoryMovementType, string> = {
      INITIAL_STOCK: 'Stock inicial',
      PURCHASE_IN: 'Entrada por compra',
      PURCHASE_CANCEL_OUT: 'Salida por anulación de compra',
      SALE_OUT: 'Salida por venta',
      SALE_RETURN_IN: 'Entrada por devolución/anulación',
      TRANSFER_IN: 'Entrada por transferencia',
      TRANSFER_OUT: 'Salida por transferencia',
      TRANSFER_CANCEL_IN: 'Entrada por anulación de transferencia',
      TRANSFER_CANCEL_OUT: 'Salida por anulación de transferencia',
      ADJUSTMENT_IN: 'Ajuste de entrada',
      ADJUSTMENT_OUT: 'Ajuste de salida',
    };
    return labels[type] || type;
  }

  private formatValue(
    value: ReportValue,
    format: ReportFormat = 'text',
  ): string {
    if (value === null || value === undefined || value === '') return '-';
    if (format === 'currency') {
      return new Intl.NumberFormat('es-BO', {
        style: 'currency',
        currency: 'BOB',
        minimumFractionDigits: 2,
      }).format(Number(value));
    }
    if (format === 'number') {
      return new Intl.NumberFormat('es-BO', {
        maximumFractionDigits: 3,
      }).format(Number(value));
    }
    if (format === 'date' || format === 'datetime') {
      const options: Intl.DateTimeFormatOptions =
        format === 'datetime'
          ? {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/La_Paz',
            }
          : {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              timeZone: 'America/La_Paz',
            };
      return new Intl.DateTimeFormat('es-BO', options).format(
        new Date(String(value)),
      );
    }
    return String(value);
  }

  private escapeHtml(value: ReportValue | undefined): string {
    const text =
      value instanceof Date ? value.toISOString() : String(value ?? '');

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private buildReportHtml(report: AnalyticsReportDocument): string {
    const metricHtml = report.metrics
      .map(
        (metric) => `
          <div class="metric">
            <span>${this.escapeHtml(metric.label)}</span>
            <strong>${this.escapeHtml(
              this.formatValue(metric.value, metric.format),
            )}</strong>
          </div>`,
      )
      .join('');
    const sectionsHtml = report.sections
      .map(
        (section) => `
          <section>
            <h2>${this.escapeHtml(section.title)}</h2>
            ${section.subtitle ? `<p class="muted">${this.escapeHtml(section.subtitle)}</p>` : ''}
            ${
              section.metrics?.length
                ? `<div class="section-metrics">${section.metrics
                    .map(
                      (metric) =>
                        `<span><b>${this.escapeHtml(metric.label)}:</b> ${this.escapeHtml(
                          this.formatValue(metric.value, metric.format),
                        )}</span>`,
                    )
                    .join('')}</div>`
                : ''
            }
            ${section.tables
              .map(
                (table) => `
                  <div class="table-block">
                    <h3>${this.escapeHtml(table.title)}</h3>
                    ${table.subtitle ? `<p class="muted">${this.escapeHtml(table.subtitle)}</p>` : ''}
                    ${
                      table.rows.length
                        ? `<table>
                            <thead><tr>${table.columns
                              .map(
                                (column) =>
                                  `<th style="text-align:${column.align || 'left'}">${this.escapeHtml(column.label)}</th>`,
                              )
                              .join('')}</tr></thead>
                            <tbody>
                              ${table.rows
                                .map(
                                  (row) =>
                                    `<tr>${table.columns
                                      .map(
                                        (column) =>
                                          `<td style="text-align:${column.align || 'left'}">${this.escapeHtml(
                                            this.formatValue(
                                              row[column.key],
                                              column.format,
                                            ),
                                          )}</td>`,
                                      )
                                      .join('')}</tr>`,
                                )
                                .join('')}
                              ${(table.totals || [])
                                .map(
                                  (row) =>
                                    `<tr class="total-row">${table.columns
                                      .map(
                                        (column) =>
                                          `<td style="text-align:${column.align || 'left'}">${this.escapeHtml(
                                            this.formatValue(
                                              row[column.key],
                                              column.format,
                                            ),
                                          )}</td>`,
                                      )
                                      .join('')}</tr>`,
                                )
                                .join('')}
                            </tbody>
                          </table>`
                        : `<p class="empty">${this.escapeHtml(report.emptyMessage)}</p>`
                    }
                  </div>`,
              )
              .join('')}
          </section>`,
      )
      .join('');

    return `<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #17211d; padding: 18px; font-size: 10px; }
            header { border-bottom: 3px solid #07553d; margin-bottom: 16px; padding-bottom: 12px; }
            h1 { color: #07553d; font-size: 23px; margin: 0 0 6px; }
            h2 { color: #07553d; font-size: 16px; margin: 22px 0 5px; }
            h3 { font-size: 12px; margin: 12px 0 5px; }
            p { margin: 3px 0; }
            .muted { color: #5f6d66; }
            .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
            .metric { border: 1px solid #cbd5d0; border-radius: 5px; padding: 8px; }
            .metric span { color: #5f6d66; display: block; }
            .metric strong { display: block; font-size: 14px; margin-top: 4px; }
            .section-metrics { background: #edf6f1; display: flex; gap: 18px; padding: 7px; }
            .table-block { break-inside: auto; margin-bottom: 14px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #aebbb4; padding: 5px; vertical-align: top; }
            th { background: #e4eee9; color: #163d2e; }
            tr { break-inside: avoid; }
            .total-row td { background: #eef3f0; font-weight: bold; }
            .empty { border: 1px dashed #aebbb4; color: #5f6d66; padding: 12px; text-align: center; }
            footer { border-top: 1px solid #cbd5d0; color: #6b756f; margin-top: 25px; padding-top: 8px; text-align: center; }
          </style>
        </head>
        <body>
          <header>
            <h1>${this.escapeHtml(report.title)}</h1>
            <p>${this.escapeHtml(report.description)}</p>
            ${report.periodLabel ? `<p><b>Periodo:</b> ${this.escapeHtml(report.periodLabel)}</p>` : ''}
            <p><b>Generado:</b> ${this.escapeHtml(
              new Date(report.generatedAt).toLocaleString('es-BO', {
                timeZone: 'America/La_Paz',
              }),
            )}</p>
          </header>
          <div class="metrics">${metricHtml}</div>
          ${sectionsHtml}
          <footer>Sistema de Ventas e Inventarios — Yungas Distribuidora</footer>
        </body>
      </html>`;
  }

  private async writePdf(html: string, filename: string): Promise<string> {
    let browser: puppeteer.Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '16px', bottom: '16px', left: '16px', right: '16px' },
      });
      const uploadDir = path.join(process.cwd(), 'uploads', 'reports');
      fs.mkdirSync(uploadDir, { recursive: true });
      const safeFilename = filename.replace(/[^\w-]/g, '_');
      fs.writeFileSync(path.join(uploadDir, `${safeFilename}.pdf`), pdfBuffer);
      return `/uploads/reports/${safeFilename}.pdf`;
    } finally {
      if (browser) await browser.close();
    }
  }
}
