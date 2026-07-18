import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportHistoryService } from './report-history.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportHistoryService: ReportHistoryService,
  ) {}

  private escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
  async generatePurchasePDF(
  purchaseId: string,
): Promise<string> {
  const purchase =
    await this.prisma.purchase.findUnique({
      where: {
        id: purchaseId,
      },
      include: {
        providerGroups: {
          where: {
            status:
              $Enums.PurchaseProviderStatus.RECEIVED,
          },
          include: {
            provider: true,
            details: {
              include: {
                product: true,
                category: true,
              },
            },
          },
        },
      },
    });

  if (!purchase) {
    throw new NotFoundException(
      'Compra no encontrada',
    );
  }

  if (
    purchase.status !==
    $Enums.PurchaseStatus.RECEIVED
  ) {
    throw new NotFoundException(
      'El comprobante solo se genera cuando la compra está recibida',
    );
  }

  const providerGroups = [
    ...purchase.providerGroups,
  ].sort((a, b) =>
    a.provider.companyName.localeCompare(
      b.provider.companyName,
    ),
  );

  let providersHtml = '';
  let generalTotal = 0;

  for (const providerGroup of providerGroups) {
    const categoryMap = new Map<
      string,
      {
        name: string;
        details: typeof providerGroup.details;
        subtotal: number;
      }
    >();

    for (const detail of providerGroup.details) {
      const categoryId = detail.categoryId;
      const categoryName =
        detail.category?.name || 'Sin categoría';

      const current = categoryMap.get(categoryId);

      if (current) {
        current.details.push(detail);
        current.subtotal += detail.subtotal;
      } else {
        categoryMap.set(categoryId, {
          name: categoryName,
          details: [detail],
          subtotal: detail.subtotal,
        });
      }
    }

    let rows = '';
    let providerTotal = 0;

    const categories = Array.from(
      categoryMap.values(),
    ).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    for (const category of categories) {
      const sortedDetails = [
        ...category.details,
      ].sort((a, b) =>
        a.product.name.localeCompare(
          b.product.name,
        ),
      );

      for (const detail of sortedDetails) {
        rows += `
          <tr>
            <td>${this.escapeHtml(detail.product.name)}</td>
            <td>${this.escapeHtml(category.name)}</td>
            <td class="number">${detail.quantity}</td>
            <td class="number">${detail.unitPrice.toFixed(2)}</td>
            <td class="number">${detail.subtotal.toFixed(2)}</td>
          </tr>
        `;
      }

      providerTotal += category.subtotal;

      rows += `
        <tr class="category-total">
          <td colspan="4">
            Subtotal categoría ${this.escapeHtml(category.name)}
          </td>
          <td class="number">
            ${category.subtotal.toFixed(2)}
          </td>
        </tr>
      `;
    }

    generalTotal += providerTotal;

    providersHtml += `
      <section class="provider-section">
        <div class="provider-title">
          Proveedor: ${this.escapeHtml(
            providerGroup.provider.companyName,
          )}
        </div>

        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Cantidad</th>
              <th>Precio unitario</th>
              <th>Subtotal</th>
            </tr>
          </thead>

          <tbody>
            ${rows}

            <tr class="provider-total">
              <td colspan="4">
                Total proveedor:
                ${this.escapeHtml(
                  providerGroup.provider.companyName,
                )}
              </td>
              <td class="number">
                ${providerTotal.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    `;
  }

  const purchaseDate = new Date(
    purchase.date,
  ).toLocaleDateString('es-BO');

  const html = `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            font-family: Arial, sans-serif;
            padding: 28px;
            color: #111;
            font-size: 12px;
          }

          .document-header {
            text-align: center;
            margin-bottom: 35px;
          }

          .document-header h1 {
            margin: 0 0 8px;
            font-size: 22px;
          }

          .document-header p {
            margin: 0;
            font-size: 14px;
          }

          .provider-section {
            margin-bottom: 30px;
            page-break-inside: avoid;
          }

          .provider-title {
            border: 1px solid #222;
            border-bottom: 0;
            padding: 9px;
            font-size: 15px;
            font-weight: bold;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th,
          td {
            border: 1px solid #222;
            padding: 8px;
          }

          th {
            text-align: left;
            background: #f2f2f2;
          }

          .number {
            text-align: right;
            white-space: nowrap;
          }

          .category-total td {
            font-weight: bold;
            background: #fafafa;
          }

          .category-total td:first-child,
          .provider-total td:first-child {
            text-align: right;
          }

          .provider-total td {
            font-weight: bold;
            font-size: 13px;
            background: #eeeeee;
          }

          .general-total {
            margin-top: 20px;
            text-align: right;
            font-size: 17px;
            font-weight: bold;
          }
        </style>
      </head>

      <body>
        <header class="document-header">
          <h1>COMPROBANTE DE COMPRAS</h1>
          <p>Fecha: ${purchaseDate}</p>
        </header>

        ${providersHtml}

        <div class="general-total">
          TOTAL GENERAL DE LA COMPRA:
          ${generalTotal.toFixed(2)} Bs.
        </div>
      </body>
    </html>
  `;

  return this.generatePDF(
    html,
    `comprobante-compra-${purchase.id}`,
    'purchases',
  );
}

  async generateSalePDF(saleId: string): Promise<string> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        client: {
          include: {
            location: true,
          },
        },
        user: true,
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    let rows = '';

    for (const detail of sale.details) {
      rows += `
        <tr>
          <td>${detail.product.name}</td>
          <td style="text-align:center;">${detail.quantity}</td>
          <td style="text-align:right;">${detail.unitPrice.toFixed(2)}</td>
          <td style="text-align:right;">${detail.subtotal.toFixed(2)}</td>
        </tr>
      `;
    }

    const html = this.buildDocumentHTML(
      'NOTA DE VENTA',
      `
        <p><strong>N° Venta:</strong> ${sale.saleNumber}</p>
        <p><strong>Cliente:</strong> ${sale.client.fullName}</p>
        <p><strong>Localidad:</strong> ${sale.client.location?.name || '-'}</p>
        <p><strong>Atendido por:</strong> ${sale.user.name}</p>
        <p><strong>Fecha:</strong> ${new Date(sale.date).toLocaleString('es-BO')}</p>
      `,
      `
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Precio Unit.</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="text-align:right;"><strong>Descuento:</strong> ${sale.discount.toFixed(2)} Bs.</p>
        <div class="total">TOTAL: ${sale.total.toFixed(2)} Bs.</div>
      `,
    );

    return this.generatePDF(html, `venta-${sale.saleNumber}`, 'sales');
  }

  async getInventoryGeneral() {
    const products = await this.prisma.product.findMany({
      include: {
        category: true,
        provider: true,
      },
      orderBy: [
        {
          category: {
            name: 'asc',
          },
        },
        {
          name: 'asc',
        },
      ],
    });

    const items = products.map((product) => ({
      productId: product.id,
      name: product.name,
      category: product.category?.name || 'Sin categoría',
      provider: product.provider?.companyName || '-',
      stock: product.stock,
      minStock: product.minStock,
      unit: product.unit,
      purchasePrice: product.purchasePrice,
      totalValue: product.stock * product.purchasePrice,
      isLowStock: product.stock <= product.minStock && product.minStock > 0,
    }));

    return {
      items,
      totalProducts: items.length,
      totalStock: items.reduce((sum, item) => sum + item.stock, 0),
      totalValue: items.reduce((sum, item) => sum + item.totalValue, 0),
      lowStockProducts: items.filter((item) => item.isLowStock).length,
      generatedAt: new Date(),
    };
  }

  async generateInventoryPDF(
    userId: number,
  ): Promise<{ pdfUrl: string; historyId: string }> {
    const data = await this.getInventoryGeneral();

    let rows = '';

    for (const item of data.items) {
      rows += `
        <tr style="${item.isLowStock ? 'background:#fff3cd;' : ''}">
          <td>${item.name}</td>
          <td>${item.category}</td>
          <td>${item.provider}</td>
          <td style="text-align:center;">${item.stock}</td>
          <td style="text-align:center;">${item.unit}</td>
          <td style="text-align:right;">${item.purchasePrice.toFixed(2)}</td>
          <td style="text-align:right;">${item.totalValue.toFixed(2)}</td>
        </tr>
      `;
    }

    const html = this.buildDocumentHTML(
      'REPORTE DE INVENTARIO',
      `
        <p><strong>Total productos:</strong> ${data.totalProducts}</p>
        <p><strong>Stock total:</strong> ${data.totalStock}</p>
        <p><strong>Productos con stock bajo:</strong> ${data.lowStockProducts}</p>
        <p><strong>Valor total:</strong> ${data.totalValue.toFixed(2)} Bs.</p>
      `,
      `
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Proveedor</th>
              <th>Stock</th>
              <th>Unidad</th>
              <th>Costo</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `,
    );

    const pdfUrl = await this.generatePDF(
      html,
      `inventario-general-${new Date().toISOString().slice(0, 10)}`,
      'reports',
    );

    const history = await this.reportHistoryService.create({
      type: $Enums.ReportType.INVENTORY_GENERAL,
      title: 'Inventario General',
      filters: {},
      pdfUrl,
      userId,
    });

    return {
      pdfUrl,
      historyId: history.id,
    };
  }

  async getSalesByDate(filters: ReportFiltersDto) {
    const where: any = {
      status: $Enums.SaleStatus.CONFIRMED,
    };

    if (filters.dateFrom || filters.dateTo) {
      where.date = {};

      if (filters.dateFrom) {
        where.date.gte = new Date(filters.dateFrom);
      }

      if (filters.dateTo) {
        where.date.lte = new Date(filters.dateTo);
      }
    }

    if (filters.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters.locationId) {
      where.client = {
        locationId: filters.locationId,
      };
    }

    if (filters.productId) {
      where.details = {
        some: {
          productId: filters.productId,
        },
      };
    }

    if (filters.paymentStatus) {
      where.paymentStatus = filters.paymentStatus;
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        client: {
          include: {
            location: true,
          },
        },
        user: true,
        details: {
          include: {
            product: true,
          },
        },
        payments: true,
      },
      orderBy: {
        date: 'desc',
      },
    });

    return {
      sales,
      totalSales: sales.length,
      totalAmount: sales.reduce((sum, sale) => sum + sale.total, 0),
      totalPaid: sales.reduce(
        (sum, sale) =>
          sum + sale.payments.reduce((pSum, payment) => pSum + payment.amount, 0),
        0,
      ),
      generatedAt: new Date(),
    };
  }

  async generateSalesPDF(
    filters: ReportFiltersDto,
    userId: number,
  ): Promise<{ pdfUrl: string; historyId: string }> {
    const data = await this.getSalesByDate(filters);

    let rows = '';

    for (const sale of data.sales) {
      rows += `
        <tr>
          <td>${sale.saleNumber}</td>
          <td>${sale.client.fullName}</td>
          <td>${sale.client.location?.name || '-'}</td>
          <td>${new Date(sale.date).toLocaleDateString('es-BO')}</td>
          <td>${sale.paymentStatus}</td>
          <td style="text-align:right;">${sale.total.toFixed(2)}</td>
        </tr>
      `;
    }

    const html = this.buildDocumentHTML(
      'REPORTE DE VENTAS',
      `
        <p><strong>Total ventas:</strong> ${data.totalSales}</p>
        <p><strong>Monto total:</strong> ${data.totalAmount.toFixed(2)} Bs.</p>
        <p><strong>Total cobrado:</strong> ${data.totalPaid.toFixed(2)} Bs.</p>
      `,
      `
        <table>
          <thead>
            <tr>
              <th>N° Venta</th>
              <th>Cliente</th>
              <th>Localidad</th>
              <th>Fecha</th>
              <th>Pago</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `,
    );

    const pdfUrl = await this.generatePDF(
      html,
      `ventas-${new Date().toISOString().slice(0, 10)}`,
      'reports',
    );

    const history = await this.reportHistoryService.create({
      type: $Enums.ReportType.SALES_REPORT,
      title: 'Reporte de Ventas',
      filters,
      pdfUrl,
      userId,
    });

    return {
      pdfUrl,
      historyId: history.id,
    };
  }

  async getSalesSummary(filters: ReportFiltersDto) {
    const data = await this.getSalesByDate({
      ...filters,
      paymentStatus: filters.paymentStatus,
    });

    const totalDebt = data.sales.reduce((sum, sale) => {
      const paid = sale.payments.reduce(
        (pSum, payment) => pSum + payment.amount,
        0,
      );

      return sum + (sale.total - paid);
    }, 0);

    return {
      ...data,
      totalDebt,
    };
  }

  async generateSalesSummaryPDF(
    filters: ReportFiltersDto,
    userId: number,
  ): Promise<{ pdfUrl: string; historyId: string }> {
    const data = await this.getSalesSummary(filters);

    let rows = '';

    for (const sale of data.sales) {
      const paid = sale.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      );

      const debt = sale.total - paid;

      rows += `
        <tr>
          <td>${sale.saleNumber}</td>
          <td>${sale.client.fullName}</td>
          <td style="text-align:right;">${sale.total.toFixed(2)}</td>
          <td style="text-align:right;">${paid.toFixed(2)}</td>
          <td style="text-align:right;">${debt.toFixed(2)}</td>
        </tr>
      `;
    }

    const html = this.buildDocumentHTML(
      'RESUMEN DE VENTAS',
      `
        <p><strong>Total ventas:</strong> ${data.totalSales}</p>
        <p><strong>Total vendido:</strong> ${data.totalAmount.toFixed(2)} Bs.</p>
        <p><strong>Saldo pendiente:</strong> ${data.totalDebt.toFixed(2)} Bs.</p>
      `,
      `
        <table>
          <thead>
            <tr>
              <th>N° Venta</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Pagado</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `,
    );

    const pdfUrl = await this.generatePDF(
      html,
      `resumen-ventas-${new Date().toISOString().slice(0, 10)}`,
      'reports',
    );

    const history = await this.reportHistoryService.create({
      type: $Enums.ReportType.SALES_REPORT,
      title: 'Resumen de Ventas',
      filters,
      pdfUrl,
      userId,
    });

    return {
      pdfUrl,
      historyId: history.id,
    };
  }

  async getCollectionReport(filters: ReportFiltersDto) {
    const where: any = {};

    if (filters.dateFrom || filters.dateTo) {
      where.receivedAt = {};

      if (filters.dateFrom) {
        where.receivedAt.gte = new Date(filters.dateFrom);
      }

      if (filters.dateTo) {
        where.receivedAt.lte = new Date(filters.dateTo);
      }
    }

    if (filters.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters.paymentMethod) {
      where.method = filters.paymentMethod;
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        client: true,
        sale: true,
        user: true,
      },
      orderBy: {
        receivedAt: 'desc',
      },
    });

    return {
      payments,
      totalCollected: payments.reduce((sum, payment) => sum + payment.amount, 0),
      totalCash: payments
        .filter((payment) => payment.method === $Enums.PaymentMethod.CASH)
        .reduce((sum, payment) => sum + payment.amount, 0),
      totalQr: payments
        .filter((payment) => payment.method === $Enums.PaymentMethod.QR)
        .reduce((sum, payment) => sum + payment.amount, 0),
      totalBankTransfer: payments
        .filter(
          (payment) => payment.method === $Enums.PaymentMethod.BANK_TRANSFER,
        )
        .reduce((sum, payment) => sum + payment.amount, 0),
      generatedAt: new Date(),
    };
  }

  async generateCollectionPDF(
    filters: ReportFiltersDto,
    userId: number,
  ): Promise<{ pdfUrl: string; historyId: string }> {
    const data = await this.getCollectionReport(filters);

    let rows = '';

    for (const payment of data.payments) {
      rows += `
        <tr>
          <td>${payment.client.fullName}</td>
          <td>${payment.sale.saleNumber}</td>
          <td>${new Date(payment.receivedAt).toLocaleDateString('es-BO')}</td>
          <td>${payment.method}</td>
          <td style="text-align:right;">${payment.amount.toFixed(2)}</td>
          <td>${payment.user.name}</td>
        </tr>
      `;
    }

    const html = this.buildDocumentHTML(
      'REPORTE DE COBRANZA',
      `
        <p><strong>Total cobrado:</strong> ${data.totalCollected.toFixed(2)} Bs.</p>
        <p><strong>Efectivo:</strong> ${data.totalCash.toFixed(2)} Bs.</p>
        <p><strong>QR:</strong> ${data.totalQr.toFixed(2)} Bs.</p>
        <p><strong>Transferencia:</strong> ${data.totalBankTransfer.toFixed(2)} Bs.</p>
      `,
      `
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>N° Venta</th>
              <th>Fecha</th>
              <th>Método</th>
              <th>Monto</th>
              <th>Cobrador</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `,
    );

    const pdfUrl = await this.generatePDF(
      html,
      `cobranza-${new Date().toISOString().slice(0, 10)}`,
      'reports',
    );

    const history = await this.reportHistoryService.create({
      type: $Enums.ReportType.COLLECTION_REPORT,
      title: 'Reporte de Cobranza',
      filters,
      pdfUrl,
      userId,
    });

    return {
      pdfUrl,
      historyId: history.id,
    };
  }

  private async generatePDF(
    html: string,
    filename: string,
    folder: 'reports' | 'purchases' | 'sales' = 'reports',
  ): Promise<string> {
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
        printBackground: true,
        margin: {
          top: '20px',
          bottom: '20px',
          left: '20px',
          right: '20px',
        },
      });

      const safeFilename = filename.replace(/[^\w-]/g, '_');
      const uploadDir = path.join(process.cwd(), 'uploads', folder);

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, `${safeFilename}.pdf`);

      fs.writeFileSync(filePath, pdfBuffer);

      return `/uploads/${folder}/${safeFilename}.pdf`;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private buildDocumentHTML(
    title: string,
    infoHTML: string,
    contentHTML: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              color: #222;
            }

            .header {
              text-align: center;
              margin-bottom: 25px;
              border-bottom: 2px solid #2c3e50;
              padding-bottom: 15px;
            }

            .header h1 {
              color: #2c3e50;
              margin: 0;
            }

            .info {
              background: #f8f8f8;
              padding: 12px;
              border: 1px solid #ddd;
              margin-bottom: 20px;
            }

            .info p {
              margin: 5px 0;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }

            th {
              background: #e0e0e0;
            }

            th,
            td {
              border: 1px solid #ccc;
              padding: 8px;
              font-size: 12px;
            }

            .total {
              margin-top: 15px;
              padding: 10px;
              background: #d4edda;
              border: 1px solid #b7dfc1;
              font-size: 18px;
              font-weight: bold;
              text-align: right;
            }

            .footer {
              margin-top: 30px;
              border-top: 1px solid #ccc;
              padding-top: 10px;
              text-align: center;
              font-size: 11px;
              color: #777;
            }
          </style>
        </head>

        <body>
          <div class="header">
            <h1>${title}</h1>
            <p>Generado: ${new Date().toLocaleString('es-BO')}</p>
          </div>

          <div class="info">
            ${infoHTML}
          </div>

          ${contentHTML}

          <div class="footer">
            Sistema de Ventas e Inventarios
          </div>
        </body>
      </html>
    `;
  }
}