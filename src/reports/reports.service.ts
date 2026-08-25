import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportHistoryService } from './report-history.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { renderPdf } from '../common/pdf/render-pdf';
import { ObjectStorageService } from '../storage/object-storage.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportHistoryService: ReportHistoryService,
    private readonly storage: ObjectStorageService,
  ) {}

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private saleLogoDataUri?: string;

  private getSaleLogoDataUri(): string {
    if (this.saleLogoDataUri) {
      return this.saleLogoDataUri;
    }

    const possibleLogoPaths = [
      join(
        __dirname,
        '..',
        'assets',
        'logo-yungas.jpeg',
      ),
      join(
        process.cwd(),
        'dist',
        'assets',
        'logo-yungas.jpeg',
      ),
      join(
        process.cwd(),
        'dist',
        'src',
        'assets',
        'logo-yungas.jpeg',
      ),
      join(
        process.cwd(),
        'src',
        'assets',
        'logo-yungas.jpeg',
      ),
    ];

    const logoPath = possibleLogoPaths.find(
      (candidate) => existsSync(candidate),
    );

    if (!logoPath) {
      throw new Error(
        `No se encontró el logo corporativo. Rutas revisadas: ${possibleLogoPaths.join(', ')}`,
      );
    }

    this.saleLogoDataUri = `data:image/jpeg;base64,${readFileSync(
      logoPath,
    ).toString('base64')}`;

    return this.saleLogoDataUri;
  }
  async generatePurchasePDF(purchaseId: string): Promise<string> {
    const purchase = await this.prisma.purchase.findUnique({
      where: {
        id: purchaseId,
      },
      include: {
        providerGroups: {
          where: {
            status: $Enums.PurchaseProviderStatus.RECEIVED,
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
      throw new NotFoundException('Compra no encontrada');
    }

    if (purchase.status !== $Enums.PurchaseStatus.RECEIVED) {
      throw new NotFoundException(
        'El comprobante solo se genera cuando la compra está recibida',
      );
    }

    const providerGroups = [...purchase.providerGroups].sort((a, b) =>
      a.provider.companyName.localeCompare(b.provider.companyName),
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
        const categoryName = detail.category?.name || 'Sin categoría';

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

      const categories = Array.from(categoryMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      for (const category of categories) {
        const sortedDetails = [...category.details].sort((a, b) =>
          a.product.name.localeCompare(b.product.name),
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
          Proveedor: ${this.escapeHtml(providerGroup.provider.companyName)}
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
                ${this.escapeHtml(providerGroup.provider.companyName)}
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

    const purchaseDate = new Date(purchase.date).toLocaleDateString('es-BO');

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

  async generateSalePDF(saleId: string, isCancelled = false): Promise<string> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        client: {
          include: {
            location: true,
          },
        },
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

    const rows = sale.details
      .map(
        (detail, index) => `
          <tr>
            <td class="item-number">${index + 1}</td>
            <td class="product-name">
              ${this.escapeHtml(detail.product.name)}
            </td>
            <td class="quantity">${detail.quantity}</td>
            <td class="number">${detail.unitPrice.toFixed(2)}</td>
            <td class="number subtotal">${detail.subtotal.toFixed(2)}</td>
          </tr>
        `,
      )
      .join('');

    const saleDate = new Date(sale.date).toLocaleDateString('es-BO');
    const logoDataUri = this.getSaleLogoDataUri();
    const statusBadge = isCancelled
      ? '<span class="status-badge cancelled">ANULADA</span>'
      : '';
    const observations = sale.observations
      ? `
          <section class="observations">
            <span class="field-label">Observaciones</span>
            <p>${this.escapeHtml(sale.observations)}</p>
          </section>
        `
      : '';

    const html = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <style>
            * {
              box-sizing: border-box;
            }

            :root {
              --ink: #0b0f14;
              --muted: #52606d;
              --line: #c8ced6;
              --line-dark: #87919d;
              --surface: #f4f6f8;
              --navy: #123a56;
              --teal: #267f72;
              --danger: #b42318;
            }

            body {
              margin: 0;
              padding: 10px 14px;
              color: var(--ink);
              font-family: Arial, Helvetica, sans-serif;
              font-size: 11px;
              background: #ffffff;
            }

            .document {
              width: 100%;
            }

            .invoice-header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              min-height: 92px;
              padding: 4px 0 14px;
            }

            .title-block {
              padding-top: 4px;
            }

            .title-block h1 {
              margin: 0;
              color: #000000;
              font-size: 27px;
              line-height: 1.05;
              letter-spacing: -0.4px;
            }

            .title-block p {
              margin: 8px 0 0;
              color: var(--navy);
              font-size: 11px;
              font-weight: 500;
            }

            .brand-block {
              display: flex;
              align-items: flex-start;
              gap: 12px;
            }

            .brand-logo {
              width: 108px;
              height: 82px;
              object-fit: contain;
            }

            .status-badge {
              display: inline-block;
              margin-top: 2px;
              padding: 5px 8px;
              border-radius: 2px;
              font-size: 9px;
              font-weight: 700;
              letter-spacing: 0.7px;
            }

            .status-badge.cancelled {
              color: var(--danger);
              background: #feeceb;
            }

            .header-line {
              height: 1px;
              margin-bottom: 18px;
              background: var(--line);
            }

            .sale-data {
              display: grid;
              grid-template-columns: 1fr 1fr;
              column-gap: 26px;
              row-gap: 17px;
              margin-bottom: 25px;
            }

            .field {
              min-height: 42px;
              padding-bottom: 7px;
              border-bottom: 1px solid var(--line-dark);
            }

            .field-label {
              display: block;
              margin-bottom: 8px;
              color: var(--navy);
              font-size: 9px;
              font-weight: 600;
              letter-spacing: 0.45px;
            }

            .field-value {
              display: block;
              color: var(--ink);
              font-size: 12px;
              font-weight: 500;
              overflow-wrap: anywhere;
            }

            .section-title {
              margin: 0 0 9px;
              color: var(--ink);
              font-size: 12px;
              font-weight: 700;
              letter-spacing: 0.5px;
              text-transform: uppercase;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin: 0;
            }

            thead {
              display: table-header-group;
            }

            tr {
              page-break-inside: avoid;
            }

            th {
              padding: 9px 8px;
              border-top: 1px solid var(--line-dark);
              border-bottom: 1px solid var(--line-dark);
              color: var(--muted);
              background: var(--surface);
              font-size: 9px;
              font-weight: 700;
              letter-spacing: 0.35px;
              text-align: left;
              text-transform: uppercase;
            }

            td {
              padding: 10px 8px;
              border-bottom: 1px solid #e3e7eb;
              font-size: 10.5px;
              vertical-align: middle;
            }

            tbody tr:nth-child(even) {
              background: #fafbfc;
            }

            .item-number {
              width: 7%;
              color: var(--muted);
              text-align: center;
            }

            .product-name {
              width: 45%;
              font-weight: 500;
            }

            .quantity {
              width: 13%;
              text-align: center;
              white-space: nowrap;
            }

            .number {
              width: 17.5%;
              text-align: right;
              white-space: nowrap;
            }

            .subtotal {
              font-weight: 600;
            }

            .totals-wrap {
              display: flex;
              justify-content: flex-end;
              margin-top: 16px;
              page-break-inside: avoid;
            }

            .totals {
              width: 300px;
            }

            .total-row {
              display: flex;
              justify-content: space-between;
              padding: 7px 0;
              border-bottom: 1px solid var(--line);
            }

            .total-row span:first-child {
              color: var(--muted);
              font-size: 10px;
            }

            .total-row span:last-child {
              color: var(--ink);
              font-weight: 600;
            }

            .grand-total {
              margin-top: 3px;
              padding: 11px 0 8px;
              border-top: 2px solid var(--ink);
              border-bottom: 0;
            }

            .grand-total span:first-child,
            .grand-total span:last-child {
              color: var(--ink);
              font-size: 17px;
              font-weight: 800;
            }

            .observations {
              margin-top: 22px;
              padding: 0 0 9px;
              border-bottom: 1px solid var(--line-dark);
              page-break-inside: avoid;
            }

            .observations p {
              margin: 0;
              color: var(--ink);
              font-size: 10.5px;
              line-height: 1.5;
              white-space: pre-wrap;
            }

            .footer {
              margin-top: 30px;
              padding-top: 11px;
              border-top: 1px solid var(--line);
              color: var(--muted);
              font-size: 9px;
              text-align: center;
            }

            .footer strong {
              display: block;
              margin-bottom: 4px;
              color: var(--navy);
              font-size: 10px;
            }
          </style>
        </head>

        <body>
          <main class="document">
            <header class="invoice-header">
              <div class="title-block">
                <h1>${isCancelled ? 'NOTA DE VENTA ANULADA' : 'NOTA DE VENTA'}</h1>
                <p>Yungas Distribuidora</p>
              </div>

              <div class="brand-block">
                ${statusBadge}
                <img
                  class="brand-logo"
                  src="${logoDataUri}"
                  alt="Yungas Distribuidora"
                />
              </div>
            </header>

            <div class="header-line"></div>

            <section class="sale-data">
              <div class="field">
                <span class="field-label">Nro. de venta</span>
                <span class="field-value">
                  ${this.escapeHtml(sale.saleNumber)}
                </span>
              </div>

              <div class="field">
                <span class="field-label">Fecha de emisión</span>
                <span class="field-value">
                  ${this.escapeHtml(saleDate)}
                </span>
              </div>

              <div class="field">
                <span class="field-label">Cliente</span>
                <span class="field-value">
                  ${this.escapeHtml(sale.client.fullName)}
                </span>
              </div>

              <div class="field">
                <span class="field-label">Localidad</span>
                <span class="field-value">
                  ${this.escapeHtml(sale.client.location?.name || '-')}
                </span>
              </div>
            </section>

            <h2 class="section-title">Detalle de productos</h2>

            <table>
              <thead>
                <tr>
                  <th style="text-align:center;">N.º</th>
                  <th>Producto</th>
                  <th style="text-align:center;">Cantidad</th>
                  <th style="text-align:right;">Precio unit. (Bs.)</th>
                  <th style="text-align:right;">Subtotal (Bs.)</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>

            <section class="totals-wrap">
              <div class="totals">
                <div class="total-row">
                  <span>Subtotal</span>
                  <span>${sale.subtotal.toFixed(2)} Bs.</span>
                </div>
                <div class="total-row">
                  <span>Descuento</span>
                  <span>${sale.discount.toFixed(2)} Bs.</span>
                </div>
                <div class="total-row grand-total">
                  <span>Total</span>
                  <span>${sale.total.toFixed(2)} Bs.</span>
                </div>
              </div>
            </section>

            ${observations}

            <footer class="footer">
              <strong>Yungas Distribuidora</strong>
              Logística de confianza · Yungas, La Paz - Bolivia
            </footer>
          </main>
        </body>
      </html>
    `;

    const fileName = isCancelled
      ? `venta-anulada-${sale.saleNumber}`
      : `venta-${sale.saleNumber}`;

    return this.generatePDF(html, fileName, 'sales');
  }

  async getInventoryGeneral(role: $Enums.Role = $Enums.Role.ADMIN) {
    const canViewCosts = role === $Enums.Role.ADMIN;
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        provider: { isActive: true },
      },
      include: {
        category: true,
        provider: true,
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });

    const items = products.map((product) => {
      const base = {
        productId: product.id,
        name: product.name,
        category: product.category?.name || 'Sin categoría',
        provider: product.provider?.companyName || '-',
        stock: product.stock,
        minStock: product.minStock,
        unit: product.unit,
        isLowStock: product.stock <= product.minStock && product.minStock > 0,
      };
      return canViewCosts
        ? {
            ...base,
            purchasePrice: product.purchasePrice,
            totalValue: product.stock * product.purchasePrice,
          }
        : base;
    });

    return {
      items,
      totalProducts: items.length,
      totalStock: items.reduce((sum, item) => sum + item.stock, 0),
      ...(canViewCosts
        ? {
            totalValue: items.reduce(
              (sum, item: any) => sum + Number(item.totalValue || 0),
              0,
            ),
          }
        : {}),
      lowStockProducts: items.filter((item) => item.isLowStock).length,
      generatedAt: new Date(),
    };
  }

  async generateInventoryPDF(
    userId: number,
    role: $Enums.Role,
  ): Promise<{ pdfUrl: string; historyId: string }> {
    const data = await this.getInventoryGeneral(role);
    const canViewCosts = role === $Enums.Role.ADMIN;
    let rows = '';

    for (const item of data.items as any[]) {
      rows += `
        <tr style="${item.isLowStock ? 'background:#fff3cd;' : ''}">
          <td>${this.escapeHtml(item.name)}</td>
          <td>${this.escapeHtml(item.category)}</td>
          <td>${this.escapeHtml(item.provider)}</td>
          <td style="text-align:center;">${item.stock}</td>
          <td style="text-align:center;">${this.escapeHtml(item.unit)}</td>
          ${
            canViewCosts
              ? `<td style="text-align:right;">${item.purchasePrice.toFixed(2)}</td>
                 <td style="text-align:right;">${item.totalValue.toFixed(2)}</td>`
              : ''
          }
        </tr>
      `;
    }

    const html = this.buildDocumentHTML(
      'REPORTE DE INVENTARIO',
      `
        <p><strong>Total productos:</strong> ${data.totalProducts}</p>
        <p><strong>Stock total:</strong> ${data.totalStock}</p>
        <p><strong>Productos con stock bajo:</strong> ${data.lowStockProducts}</p>
        ${
          canViewCosts
            ? `<p><strong>Valor total:</strong> ${Number((data as any).totalValue).toFixed(2)} Bs.</p>`
            : ''
        }
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
              ${canViewCosts ? '<th>Costo</th><th>Valor</th>' : ''}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `,
    );

    const internalPdfUrl = await this.generatePDF(
      html,
      `inventario-general-${new Date().toISOString().slice(0, 10)}`,
      'reports',
    );
    const history = await this.reportHistoryService.create({
      type: $Enums.ReportType.INVENTORY_GENERAL,
      title: 'Inventario General',
      filters: { includeCosts: canViewCosts },
      pdfUrl: internalPdfUrl,
      userId,
    });
    return {
      pdfUrl: `/api/documents/reports/${history.id}`,
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
          sum +
          sale.payments.reduce((pSum, payment) => pSum + payment.amount, 0),
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
      pdfUrl: `/api/documents/reports/${history.id}`,
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
      pdfUrl: `/api/documents/reports/${history.id}`,
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
      totalCollected: payments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      ),
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
      pdfUrl: `/api/documents/reports/${history.id}`,
      historyId: history.id,
    };
  }

  private async generatePDF(
    html: string,
    filename: string,
    folder: 'reports' | 'purchases' | 'sales' = 'reports',
  ): Promise<string> {
    const pdfBuffer = await renderPdf(html, {
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
    return this.storage.savePrivatePdf(
      folder,
      `${safeFilename}.pdf`,
      pdfBuffer,
    );
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
