import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generatePurchasePDF(purchaseId: string): Promise<string> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        provider: true,
        user: true,
        details: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!purchase) {
      throw new Error('Compra no encontrada');
    }

    const grouped: Record<
      string,
      { category: string; items: any[]; subtotal: number }
    > = {};

    for (const detail of purchase.details) {
      const categoryName = detail.product.category?.name || 'Sin categoría';

      if (!grouped[categoryName]) {
        grouped[categoryName] = {
          category: categoryName,
          items: [],
          subtotal: 0,
        };
      }

      grouped[categoryName].items.push({
        name: detail.product.name,
        quantity: detail.quantity,
        unitPrice: detail.unitPrice,
        subtotal: detail.subtotal,
      });

      grouped[categoryName].subtotal += detail.subtotal;
    }

    const html = this.buildPurchaseHTML(purchase, grouped);

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
      });

      const filename = `compra-${purchase.id}-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;

      const uploadDir = path.join(process.cwd(), 'uploads', 'purchases');

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, filename);

      fs.writeFileSync(filePath, pdfBuffer);

      return `/uploads/purchases/${filename}`;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private buildPurchaseHTML(purchase: any, grouped: any): string {
    let categoriesHTML = '';
    let grandTotal = 0;

    for (const [categoryName, data] of Object.entries(grouped) as any) {
      let rows = '';

      for (const item of data.items) {
        rows += `
          <tr>
            <td>${item.name}</td>
            <td style="text-align:center;">${item.quantity}</td>
            <td style="text-align:right;">${item.unitPrice.toFixed(2)}</td>
            <td style="text-align:right;">${item.subtotal.toFixed(2)}</td>
          </tr>
        `;
      }

      categoriesHTML += `
        <h3 style="margin-top:20px; background:#f0f0f0; padding:8px;">
          ${categoryName}
        </h3>

        <table style="width:100%; border-collapse:collapse; margin-bottom:10px;">
          <thead>
            <tr style="background:#e0e0e0;">
              <th style="border:1px solid #ccc; padding:8px; text-align:left;">
                Producto
              </th>
              <th style="border:1px solid #ccc; padding:8px; text-align:center;">
                Cantidad
              </th>
              <th style="border:1px solid #ccc; padding:8px; text-align:right;">
                Precio Unit.
              </th>
              <th style="border:1px solid #ccc; padding:8px; text-align:right;">
                Subtotal
              </th>
            </tr>
          </thead>

          <tbody>
            ${rows}

            <tr style="font-weight:bold; background:#f9f9f9;">
              <td colspan="3" style="border:1px solid #ccc; padding:8px; text-align:right;">
                Subtotal ${categoryName}
              </td>
              <td style="border:1px solid #ccc; padding:8px; text-align:right;">
                ${data.subtotal.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      `;

      grandTotal += data.subtotal;
    }

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
            }

            .header h1 {
              color: #2c3e50;
              margin-bottom: 5px;
            }

            .info {
              margin-bottom: 20px;
              padding: 12px;
              background: #f8f8f8;
              border: 1px solid #ddd;
            }

            .info p {
              margin: 5px 0;
            }

            table {
              width: 100%;
              border-collapse: collapse;
            }

            th,
            td {
              border: 1px solid #ccc;
              padding: 8px;
            }

            .grand-total {
              font-size: 18px;
              font-weight: bold;
              text-align: right;
              margin-top: 20px;
              padding: 10px;
              background: #d4edda;
              border: 1px solid #b7dfc1;
            }
          </style>
        </head>

        <body>
          <div class="header">
            <h1>COMPROBANTE DE COMPRA</h1>
            <p>N°: ${purchase.id}</p>
            <p>Fecha: ${new Date(purchase.date).toLocaleDateString('es-BO')}</p>
          </div>

          <div class="info">
            <p><strong>Proveedor:</strong> ${purchase.provider.companyName}</p>
            <p><strong>Contacto:</strong> ${purchase.provider.contactName || '-'}</p>
            <p><strong>Teléfono:</strong> ${purchase.provider.phone || '-'}</p>
            <p><strong>Registrado por:</strong> ${purchase.user.name}</p>
            ${
              purchase.observations
                ? `<p><strong>Observaciones:</strong> ${purchase.observations}</p>`
                : ''
            }
          </div>

          ${categoriesHTML}

          <div class="grand-total">
            TOTAL DE LA COMPRA: ${grandTotal.toFixed(2)} Bs.
          </div>
        </body>
      </html>
    `;
  }
}