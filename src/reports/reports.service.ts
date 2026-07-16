import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportHistoryService } from './report-history.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private reportHistoryService: ReportHistoryService,
  ) {}

  // ============================================================
  // 1. REPORTE: INVENTARIO GENERAL
  // ============================================================
  async getInventoryGeneral() {
    const products = await this.prisma.product.findMany({
      where: { stock: { gt: 0 } },
      include: { category: true },
      orderBy: { category: { name: 'asc' } },
    });

    const grouped: Record<string, { category: string; products: any[]; subtotal: number }> = {};
    let grandTotal = 0;

    for (const product of products) {
      const catName = product.category?.name || 'Sin categoría';
      if (!grouped[catName]) {
        grouped[catName] = { category: catName, products: [], subtotal: 0 };
      }
      const value = product.stock * product.purchasePrice;
      grouped[catName].products.push({
        name: product.name,
        stock: product.stock,
        unitPrice: product.purchasePrice,
        totalValue: value,
      });
      grouped[catName].subtotal += value;
      grandTotal += value;
    }

    return {
      grouped,
      grandTotal,
      generatedAt: new Date(),
    };
  }

  async generateInventoryPDF(userId: string): Promise<{ pdfUrl: string; historyId: string }> {
    const data = await this.getInventoryGeneral();
    const html = this.buildInventoryHTML(data);
    const pdfUrl = await this.generatePDF(html, `inventario-general-${new Date().toISOString().slice(0,10)}`);
    
    const history = await this.reportHistoryService.create({
      type: 'INVENTORY_GENERAL',
      title: 'Inventario General',
      filters: {},
      pdfUrl,
      userId,
    });

    return { pdfUrl, historyId: history.id };
  }

  // ============================================================
  // 2. REPORTE: VENTAS POR FECHA (TODAS LAS VENTAS CONFIRMADAS)
  // ============================================================
  async getSalesByDate(filters: ReportFiltersDto) {
    const { dateFrom, dateTo, clientId, productId, locationId } = filters;

    const where: any = {
      status: { in: ['CONFIRMED', 'PARTIALLY_PAID', 'PAID'] },
    };
    if (dateFrom) where.date = { gte: new Date(dateFrom) };
    if (dateTo) where.date = { ...where.date, lte: new Date(dateTo) };
    if (clientId) where.clientId = clientId;
    if (locationId) where.client = { locationId };
    if (productId) {
      where.details = { some: { productId } };
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        client: true,
        details: {
          include: { product: true },
        },
        payments: true,
      },
      orderBy: { client: { fullName: 'asc' } },
    });

    // Construir matriz de clientes vs productos
    const clientMap = new Map();
    const productSet = new Set();

    for (const sale of sales) {
      const clientIdKey = sale.clientId;
      if (!clientMap.has(clientIdKey)) {
        clientMap.set(clientIdKey, {
          clientName: sale.client.fullName,
          products: {},
          total: 0,
          paymentMethods: [],
        });
      }
      const clientData = clientMap.get(clientIdKey);
      clientData.total += sale.total;

      // Si tiene pagos, registrar métodos
      if (sale.payments.length > 0) {
        for (const payment of sale.payments) {
          clientData.paymentMethods.push(payment.method);
        }
      } else {
        clientData.paymentMethods.push('PENDIENTE');
      }

      for (const detail of sale.details) {
        const prodName = detail.product.name;
        productSet.add(prodName);
        if (!clientData.products[prodName]) {
          clientData.products[prodName] = 0;
        }
        clientData.products[prodName] += detail.quantity;
      }
    }

    const productList = Array.from(productSet).sort();
    const rows = Array.from(clientMap.entries()).map(([clientId, data]) => ({
      clientId,
      clientName: data.clientName,
      ...data.products,
      total: data.total,
      paymentMethods: data.paymentMethods.join(', '),
    }));

    return {
      headers: ['Cliente', ...productList, 'Total', 'Método de Pago'],
      rows,
      productList,
      generatedAt: new Date(),
    };
  }

  async generateSalesPDF(filters: ReportFiltersDto, userId: string): Promise<{ pdfUrl: string; historyId: string }> {
    const data = await this.getSalesByDate(filters);
    const html = this.buildSalesHTML(data, 'VENTAS POR FECHA');
    const pdfUrl = await this.generatePDF(html, `ventas-${new Date().toISOString().slice(0,10)}`);
    
    const history = await this.reportHistoryService.create({
      type: 'SALES_BY_DATE',
      title: 'Ventas por Fecha',
      filters,
      pdfUrl,
      userId,
    });

    return { pdfUrl, historyId: history.id };
  }

  // ============================================================
  // 3. REPORTE: RESUMEN DE VENTAS (SOLO CLIENTES CON DEUDA)
  // ============================================================
  async getSalesSummary(filters: ReportFiltersDto) {
    // Reutilizamos la lógica de ventas pero filtramos por estados PENDING y PARTIALLY_PAID
    const { dateFrom, dateTo, clientId, locationId } = filters;

    const where: any = {
      status: { in: ['PENDING', 'PARTIALLY_PAID'] },
    };
    if (dateFrom) where.date = { gte: new Date(dateFrom) };
    if (dateTo) where.date = { ...where.date, lte: new Date(dateTo) };
    if (clientId) where.clientId = clientId;
    if (locationId) where.client = { locationId };

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        client: true,
        details: {
          include: { product: true },
        },
        payments: true,
      },
      orderBy: { client: { fullName: 'asc' } },
    });

    // Construir matriz similar al reporte 2
    const clientMap = new Map();
    const productSet = new Set();

    for (const sale of sales) {
      const clientIdKey = sale.clientId;
      if (!clientMap.has(clientIdKey)) {
        clientMap.set(clientIdKey, {
          clientName: sale.client.fullName,
          products: {},
          total: 0,
          pending: sale.total, // Inicialmente el total es lo que debe
          paymentMethods: [],
        });
      }
      const clientData = clientMap.get(clientIdKey);
      clientData.total += sale.total;

      // Calcular cuánto ha pagado
      const totalPaid = sale.payments.reduce((sum, p) => sum + p.amount, 0);
      clientData.pending = sale.total - totalPaid;

      if (sale.payments.length > 0) {
        for (const payment of sale.payments) {
          clientData.paymentMethods.push(payment.method);
        }
      } else {
        clientData.paymentMethods.push('PENDIENTE');
      }

      for (const detail of sale.details) {
        const prodName = detail.product.name;
        productSet.add(prodName);
        if (!clientData.products[prodName]) {
          clientData.products[prodName] = 0;
        }
        clientData.products[prodName] += detail.quantity;
      }
    }

    const productList = Array.from(productSet).sort();
    const rows = Array.from(clientMap.entries()).map(([clientId, data]) => ({
      clientId,
      clientName: data.clientName,
      ...data.products,
      total: data.total,
      pending: data.pending,
      paymentMethods: data.paymentMethods.join(', '),
    }));

    // Calcular sumas generales
    const totals = {
      totalGeneral: rows.reduce((sum, r) => sum + r.total, 0),
      totalPending: rows.reduce((sum, r) => sum + r.pending, 0),
    };

    return {
      headers: ['Cliente', ...productList, 'Total', 'Saldo Pendiente', 'Método de Pago'],
      rows,
      productList,
      totals,
      generatedAt: new Date(),
    };
  }

  async generateSalesSummaryPDF(filters: ReportFiltersDto, userId: string): Promise<{ pdfUrl: string; historyId: string }> {
    const data = await this.getSalesSummary(filters);
    const html = this.buildSalesSummaryHTML(data);
    const pdfUrl = await this.generatePDF(html, `resumen-ventas-${new Date().toISOString().slice(0,10)}`);
    
    const history = await this.reportHistoryService.create({
      type: 'SALES_SUMMARY',
      title: 'Resumen de Ventas (Clientes con Deuda)',
      filters,
      pdfUrl,
      userId,
    });

    return { pdfUrl, historyId: history.id };
  }

  // ============================================================
  // 4. REPORTE: COBRANZA
  // ============================================================
  async getCollectionReport(filters: ReportFiltersDto) {
    const { dateFrom, dateTo, clientId, paymentMethod, status } = filters;

    const where: any = {};
    if (dateFrom) where.receivedAt = { gte: new Date(dateFrom) };
    if (dateTo) where.receivedAt = { ...where.receivedAt, lte: new Date(dateTo) };
    if (clientId) where.clientId = clientId;
    if (paymentMethod) where.method = paymentMethod;

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        client: true,
        sale: true,
        user: true,
      },
      orderBy: { receivedAt: 'desc' },
    });

    // Filtrar por estado de la venta si se especifica
    let filtered = payments;
    if (status) {
      filtered = payments.filter(p => p.sale.status === status);
    }

    const rows = filtered.map(p => ({
      clientName: p.client.fullName,
      paymentDate: p.receivedAt,
      method: p.method,
      amount: p.amount,
      saleTotal: p.sale.total,
      pending: p.sale.total - p.amount,
      status: p.sale.status,
    }));

    const totalCobrado = filtered.reduce((sum, p) => sum + p.amount, 0);

    return {
      rows,
      totalCobrado,
      generatedAt: new Date(),
    };
  }

  async generateCollectionPDF(filters: ReportFiltersDto, userId: string): Promise<{ pdfUrl: string; historyId: string }> {
    const data = await this.getCollectionReport(filters);
    const html = this.buildCollectionHTML(data);
    const pdfUrl = await this.generatePDF(html, `cobranza-${new Date().toISOString().slice(0,10)}`);
    
    const history = await this.reportHistoryService.create({
      type: 'COLLECTION',
      title: 'Reporte de Cobranza',
      filters,
      pdfUrl,
      userId,
    });

    return { pdfUrl, historyId: history.id };
  }

  // ============================================================
  // GENERACIÓN DE PDF (PUPPETEER)
  // ============================================================
  private async generatePDF(html: string, filename: string): Promise<string> {
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // Para entornos Linux
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ 
      format: 'A4', 
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
    });
    await browser.close();

    const uploadDir = path.join(process.cwd(), 'uploads', 'reports');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, `${filename}.pdf`);
    fs.writeFileSync(filePath, pdfBuffer);

    return `/uploads/reports/${filename}.pdf`;
  }

  // ============================================================
  // CONSTRUCTORES DE HTML PARA CADA REPORTE
  // ============================================================
  private buildInventoryHTML(data: any): string {
    let categoriesHTML = '';
    for (const [catName, catData] of Object.entries(data.grouped) as any) {
      let rows = '';
      for (const product of catData.products) {
        rows += `
          <tr>
            <td style="padding:6px; border:1px solid #ddd;">${product.name}</td>
            <td style="padding:6px; border:1px solid #ddd; text-align:center;">${product.stock}</td>
            <td style="padding:6px; border:1px solid #ddd; text-align:right;">${product.unitPrice.toFixed(2)}</td>
            <td style="padding:6px; border:1px solid #ddd; text-align:right;">${product.totalValue.toFixed(2)}</td>
          </tr>
        `;
      }
      categoriesHTML += `
        <h3 style="background:#f0f0f0; padding:10px; margin-top:20px;">${catName}</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:10px;">
          <thead>
            <tr style="background:#e0e0e0;">
              <th style="padding:8px; border:1px solid #ddd; text-align:left;">Producto</th>
              <th style="padding:8px; border:1px solid #ddd; text-align:center;">Stock</th>
              <th style="padding:8px; border:1px solid #ddd; text-align:right;">Precio Unit.</th>
              <th style="padding:8px; border:1px solid #ddd; text-align:right;">Valor Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="font-weight:bold; background:#f9f9f9;">
              <td colspan="3" style="padding:8px; border:1px solid #ddd; text-align:right;">Subtotal ${catName}</td>
              <td style="padding:8px; border:1px solid #ddd; text-align:right;">${catData.subtotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Inventario General</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { color: #2c3e50; }
            .grand-total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 20px; padding: 12px; background: #d4edda; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>INVENTARIO GENERAL</h1>
            <p>Fecha de generación: ${new Date(data.generatedAt).toLocaleDateString('es-BO')}</p>
          </div>
          ${categoriesHTML}
          <div class="grand-total">
            TOTAL GENERAL: ${data.grandTotal.toFixed(2)} Bs.
          </div>
        </body>
      </html>
    `;
  }

  private buildSalesHTML(data: any, title: string): string {
    // Construir tabla dinámica
    let tableRows = '';
    for (const row of data.rows) {
      tableRows += `<tr>`;
      tableRows += `<td style="padding:6px; border:1px solid #ddd;">${row.clientName}</td>`;
      for (const product of data.productList) {
        const qty = row[product] || 0;
        tableRows += `<td style="padding:6px; border:1px solid #ddd; text-align:center;">${qty}</td>`;
      }
      tableRows += `<td style="padding:6px; border:1px solid #ddd; text-align:right;">${row.total.toFixed(2)}</td>`;
      tableRows += `<td style="padding:6px; border:1px solid #ddd; text-align:center;">${row.paymentMethods}</td>`;
      tableRows += `</tr>`;
    }

    let productHeaders = '';
    for (const product of data.productList) {
      productHeaders += `<th style="padding:8px; border:1px solid #ddd; text-align:center;">${product}</th>`;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { color: #2c3e50; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 6px; }
            th { background: #f0f0f0; }
            .footer { margin-top: 20px; text-align: right; font-size: 12px; color: #888; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${title}</h1>
            <p>Fecha de generación: ${new Date(data.generatedAt).toLocaleDateString('es-BO')}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Cliente</th>
                ${productHeaders}
                <th style="padding:8px; border:1px solid #ddd; text-align:right;">Total</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:center;">Método de Pago</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div class="footer">Reporte generado automáticamente por el sistema.</div>
        </body>
      </html>
    `;
  }

  private buildSalesSummaryHTML(data: any): string {
    // Similar al HTML de ventas pero con columna de saldo pendiente y sumas
    let tableRows = '';
    for (const row of data.rows) {
      tableRows += `<tr>`;
      tableRows += `<td style="padding:6px; border:1px solid #ddd;">${row.clientName}</td>`;
      for (const product of data.productList) {
        const qty = row[product] || 0;
        tableRows += `<td style="padding:6px; border:1px solid #ddd; text-align:center;">${qty}</td>`;
      }
      tableRows += `<td style="padding:6px; border:1px solid #ddd; text-align:right;">${row.total.toFixed(2)}</td>`;
      tableRows += `<td style="padding:6px; border:1px solid #ddd; text-align:right;">${row.pending.toFixed(2)}</td>`;
      tableRows += `<td style="padding:6px; border:1px solid #ddd; text-align:center;">${row.paymentMethods}</td>`;
      tableRows += `</tr>`;
    }

    let productHeaders = '';
    for (const product of data.productList) {
      productHeaders += `<th style="padding:8px; border:1px solid #ddd; text-align:center;">${product}</th>`;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Resumen de Ventas (Clientes con Deuda)</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { color: #2c3e50; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 6px; }
            th { background: #f0f0f0; }
            .summary { margin-top: 20px; padding: 15px; background: #f9f9f9; border: 1px solid #ddd; }
            .summary-item { display: inline-block; margin-right: 30px; }
            .summary-item strong { color: #2c3e50; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>RESUMEN DE VENTAS</h1>
            <p>Clientes con deuda pendiente</p>
            <p>Fecha de generación: ${new Date(data.generatedAt).toLocaleDateString('es-BO')}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Cliente</th>
                ${productHeaders}
                <th style="padding:8px; border:1px solid #ddd; text-align:right;">Total</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:right;">Saldo Pendiente</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:center;">Método de Pago</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div class="summary">
            <div class="summary-item"><strong>Total General:</strong> ${data.totals.totalGeneral.toFixed(2)} Bs.</div>
            <div class="summary-item"><strong>Total Pendiente:</strong> ${data.totals.totalPending.toFixed(2)} Bs.</div>
          </div>
          <div class="footer">Reporte generado automáticamente por el sistema.</div>
        </body>
      </html>
    `;
  }

  private buildCollectionHTML(data: any): string {
    let rows = '';
    for (const row of data.rows) {
      rows += `
        <tr>
          <td style="padding:6px; border:1px solid #ddd;">${row.clientName}</td>
          <td style="padding:6px; border:1px solid #ddd; text-align:center;">${new Date(row.paymentDate).toLocaleDateString('es-BO')}</td>
          <td style="padding:6px; border:1px solid #ddd; text-align:center;">${row.method}</td>
          <td style="padding:6px; border:1px solid #ddd; text-align:right;">${row.amount.toFixed(2)}</td>
          <td style="padding:6px; border:1px solid #ddd; text-align:right;">${row.pending.toFixed(2)}</td>
          <td style="padding:6px; border:1px solid #ddd; text-align:center;">${row.status}</td>
        </tr>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Reporte de Cobranza</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { color: #2c3e50; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 6px; }
            th { background: #f0f0f0; }
            .total { margin-top: 20px; font-size: 16px; font-weight: bold; text-align: right; padding: 10px; background: #d4edda; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>REPORTE DE COBRANZA</h1>
            <p>Fecha de generación: ${new Date(data.generatedAt).toLocaleDateString('es-BO')}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Cliente</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:center;">Fecha de Pago</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:center;">Método</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:right;">Monto</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:right;">Saldo Pendiente</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:center;">Estado</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="total">
            TOTAL COBRADO: ${data.totalCobrado.toFixed(2)} Bs.
          </div>
        </body>
      </html>
    `;
  }
}