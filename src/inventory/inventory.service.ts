import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryItemDto } from './dto/inventory-response.dto';
import { ReportsService } from '../reports/reports.service';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private reportsService: ReportsService,
  ) {}

  // ====== OBTENER INVENTARIO ======
  async getInventory(categoryId?: string): Promise<InventoryItemDto[]> {
    const where: any = {};
    if (categoryId) {
      where.categoryId = categoryId;
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: [
        { category: { name: 'asc' } },
        { name: 'asc' },
      ],
    });

    return products.map(p => ({
      productId: p.id,
      name: p.name,
      category: p.category.name,
      categoryId: p.categoryId,
      stock: p.stock,
      unit: p.unit,
      minStock: p.minStock,
    }));
  }

  // ====== GENERAR PDF DE INVENTARIO ======
  async generateInventoryPDF(userId: string, categoryId?: string): Promise<{ pdfUrl: string; historyId: string }> {
    // Obtener datos del inventario
    const items = await this.getInventory(categoryId);
    
    // Obtener nombre de categoría si se filtra
    let categoryName = 'General';
    if (categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (category) categoryName = category.name;
    }

    // Generar HTML
    const html = this.buildInventoryHTML(items, categoryName);

    // Generar PDF con Puppeteer
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
    });
    await browser.close();

    // Guardar PDF
    const filename = `inventario-${categoryName.replace(/\s/g, '_')}-${new Date().toISOString().slice(0,10)}.pdf`;
    const uploadDir = path.join(process.cwd(), 'uploads', 'reports');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, pdfBuffer);

    const pdfUrl = `/uploads/reports/${filename}`;

    // Guardar historial
    const history = await this.prisma.reportHistory.create({
      data: {
        type: 'INVENTORY_GENERAL',
        title: `Inventario ${categoryName}`,
        parameters: JSON.stringify({ categoryId: categoryId || null }),
        fileUrl: pdfUrl,
        userId,
      },
    });

    return { pdfUrl, historyId: history.id };
  }

  // ====== CONSTRUIR HTML DEL PDF ======
  private buildInventoryHTML(items: any[], categoryName: string): string {
    // Agrupar por categoría
    const grouped = items.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});

    let categoriesHTML = '';
    for (const [cat, products] of Object.entries(grouped) as any) {
      let rows = '';
      for (const product of products) {
        const isLowStock = product.stock <= product.minStock && product.minStock > 0;
        rows += `
          <tr style="${isLowStock ? 'background-color: #fff3cd;' : ''}">
            <td style="border:1px solid #ccc; padding:8px;">${product.name}</td>
            <td style="border:1px solid #ccc; padding:8px; text-align:center;">${product.stock}</td>
            <td style="border:1px solid #ccc; padding:8px; text-align:center;">${product.unit}</td>
            <td style="border:1px solid #ccc; padding:8px; text-align:center;">${isLowStock ? '⚠️ Stock bajo' : '✓'}</td>
          </tr>
        `;
      }

      const subTotal = products.reduce((sum, p) => sum + p.stock, 0);
      
      categoriesHTML += `
        <h3 style="margin-top:20px; background:#f0f0f0; padding:8px;">${cat}</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:10px;">
          <thead>
            <tr style="background:#e0e0e0;">
              <th style="border:1px solid #ccc; padding:8px; text-align:left;">Producto</th>
              <th style="border:1px solid #ccc; padding:8px; text-align:center;">Stock</th>
              <th style="border:1px solid #ccc; padding:8px; text-align:center;">Unidad</th>
              <th style="border:1px solid #ccc; padding:8px; text-align:center;">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr style="font-weight:bold; background:#f9f9f9;">
              <td colspan="1" style="border:1px solid #ccc; padding:8px;">Total ${cat}</td>
              <td style="border:1px solid #ccc; padding:8px; text-align:center;">${subTotal}</td>
              <td colspan="2" style="border:1px solid #ccc; padding:8px;"></td>
            </tr>
          </tbody>
        </table>
      `;
    }

    const totalItems = items.reduce((sum, p) => sum + p.stock, 0);
    const date = new Date().toLocaleDateString('es-BO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; }
            .header h1 { color: #2c3e50; margin: 0; }
            .header p { color: #7f8c8d; margin: 5px 0; }
            .summary { background: #d4edda; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .summary table { width: 100%; }
            .summary td { padding: 5px; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #7f8c8d; border-top: 1px solid #ccc; padding-top: 10px; }
            .low-stock { background-color: #fff3cd; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📦 REPORTE DE INVENTARIO</h1>
            <p>${categoryName === 'General' ? 'Inventario General' : `Categoría: ${categoryName}`}</p>
            <p><strong>Fecha de generación:</strong> ${date}</p>
          </div>

          <div class="summary">
            <table>
              <tr>
                <td><strong>Total de productos:</strong> ${items.length}</td>
                <td><strong>Unidades totales:</strong> ${totalItems}</td>
                <td style="color: #856404;"><strong>⚠️ Productos con stock bajo:</strong> ${items.filter(p => p.stock <= p.minStock && p.minStock > 0).length}</td>
              </tr>
            </table>
          </div>

          ${categoriesHTML}

          <div class="footer">
            <p>Reporte generado automáticamente por el Sistema de Ventas e Inventarios</p>
          </div>
        </body>
      </html>
    `;
  }

  // ====== OBTENER HISTORIAL DE REPORTES ======
  async getHistory(userId?: string) {
    const where: any = {};
    if (userId) where.userId = userId;

    return this.prisma.reportHistory.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}