import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryItemDto } from './dto/inventory-response.dto';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getInventory(categoryId?: string): Promise<InventoryItemDto[]> {
    const where: any = {};

    if (categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });

      if (!category) {
        throw new NotFoundException('Categoría no encontrada');
      }

      where.categoryId = categoryId;
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: true,
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

    return products.map((product) => ({
      productId: product.id,
      name: product.name,
      category: product.category?.name || 'Sin categoría',
      categoryId: product.categoryId,
      stock: product.stock,
      unit: product.unit,
      minStock: product.minStock,
    }));
  }

  async generateInventoryPDF(
    userId: number,
    categoryId?: string,
  ): Promise<{ pdfUrl: string; historyId: string }> {
    const items = await this.getInventory(categoryId);

    let categoryName = 'General';

    if (categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });

      if (!category) {
        throw new NotFoundException('Categoría no encontrada');
      }

      categoryName = category.name;
    }

    const html = this.buildInventoryHTML(items, categoryName);

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
          right: '20px',
          bottom: '20px',
          left: '20px',
        },
      });

      const safeCategoryName = categoryName
        .replace(/\s+/g, '_')
        .replace(/[^\w-]/g, '');

      const filename = `inventario-${safeCategoryName}-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;

      const uploadDir = path.join(process.cwd(), 'uploads', 'reports');

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, filename);

      fs.writeFileSync(filePath, pdfBuffer);

      const pdfUrl = `/uploads/reports/${filename}`;

      const history = await this.prisma.reportHistory.create({
        data: {
          type: $Enums.ReportType.INVENTORY_GENERAL,
          title:
            categoryName === 'General'
              ? 'Inventario General'
              : `Inventario ${categoryName}`,
          parameters: JSON.stringify({
            categoryId: categoryId || null,
          }),
          fileUrl: pdfUrl,
          userId,
        },
      });

      return {
        pdfUrl,
        historyId: history.id,
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async getHistory(userId?: number) {
    const where: any = {};

    if (userId) {
      where.userId = userId;
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

  private buildInventoryHTML(
    items: InventoryItemDto[],
    categoryName: string,
  ): string {
    const grouped = items.reduce(
      (acc, item) => {
        if (!acc[item.category]) {
          acc[item.category] = [];
        }

        acc[item.category].push(item);

        return acc;
      },
      {} as Record<string, InventoryItemDto[]>,
    );

    let categoriesHTML = '';

    for (const [category, products] of Object.entries(grouped)) {
      let rows = '';

      for (const product of products) {
        const isLowStock = product.stock <= product.minStock && product.minStock > 0;

        rows += `
          <tr style="${isLowStock ? 'background-color: #fff3cd;' : ''}">
            <td style="border:1px solid #ccc; padding:8px;">${product.name}</td>
            <td style="border:1px solid #ccc; padding:8px; text-align:center;">${product.stock}</td>
            <td style="border:1px solid #ccc; padding:8px; text-align:center;">${product.unit}</td>
            <td style="border:1px solid #ccc; padding:8px; text-align:center;">
              ${isLowStock ? 'Stock bajo' : 'Normal'}
            </td>
          </tr>
        `;
      }

      const subTotal = products.reduce(
        (sum, product) => sum + product.stock,
        0,
      );

      categoriesHTML += `
        <h3 style="margin-top:20px; background:#f0f0f0; padding:8px;">
          ${category}
        </h3>

        <table style="width:100%; border-collapse:collapse; margin-bottom:10px;">
          <thead>
            <tr style="background:#e0e0e0;">
              <th style="border:1px solid #ccc; padding:8px; text-align:left;">
                Producto
              </th>
              <th style="border:1px solid #ccc; padding:8px; text-align:center;">
                Stock
              </th>
              <th style="border:1px solid #ccc; padding:8px; text-align:center;">
                Unidad
              </th>
              <th style="border:1px solid #ccc; padding:8px; text-align:center;">
                Estado
              </th>
            </tr>
          </thead>

          <tbody>
            ${rows}

            <tr style="font-weight:bold; background:#f9f9f9;">
              <td style="border:1px solid #ccc; padding:8px;">
                Total ${category}
              </td>
              <td style="border:1px solid #ccc; padding:8px; text-align:center;">
                ${subTotal}
              </td>
              <td colspan="2" style="border:1px solid #ccc; padding:8px;"></td>
            </tr>
          </tbody>
        </table>
      `;
    }

    const totalStock = items.reduce((sum, product) => sum + product.stock, 0);

    const lowStockCount = items.filter(
      (product) => product.stock <= product.minStock && product.minStock > 0,
    ).length;

    const date = new Date().toLocaleString('es-BO', {
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
          <meta charset="UTF-8" />

          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              color: #222;
            }

            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #2c3e50;
              padding-bottom: 20px;
            }

            .header h1 {
              color: #2c3e50;
              margin: 0;
            }

            .header p {
              color: #7f8c8d;
              margin: 5px 0;
            }

            .summary {
              background: #d4edda;
              padding: 15px;
              border-radius: 5px;
              margin-bottom: 20px;
            }

            .summary table {
              width: 100%;
            }

            .summary td {
              padding: 5px;
            }

            .footer {
              text-align: center;
              margin-top: 30px;
              font-size: 12px;
              color: #7f8c8d;
              border-top: 1px solid #ccc;
              padding-top: 10px;
            }
          </style>
        </head>

        <body>
          <div class="header">
            <h1>REPORTE DE INVENTARIO</h1>
            <p>
              ${
                categoryName === 'General'
                  ? 'Inventario General'
                  : `Categoría: ${categoryName}`
              }
            </p>
            <p><strong>Fecha de generación:</strong> ${date}</p>
          </div>

          <div class="summary">
            <table>
              <tr>
                <td><strong>Total de productos:</strong> ${items.length}</td>
                <td><strong>Unidades totales:</strong> ${totalStock}</td>
                <td><strong>Productos con stock bajo:</strong> ${lowStockCount}</td>
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
}