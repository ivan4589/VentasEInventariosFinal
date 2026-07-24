import { BadRequestException, Injectable } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CentralInventoryCategoryDto,
  CentralInventoryProductDto,
  CentralInventoryProviderDto,
  InventoryResponseDto,
} from './dto/inventory-response.dto';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private roundQuantity(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }

  private productCode(productId: string): string {
    return `PROD-${productId.slice(-8).toUpperCase()}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async getInventory(): Promise<InventoryResponseDto> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        isDefault: true,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        stocks: {
          where: {
            stock: {
              gt: 0,
            },
          },
          select: {
            stock: true,
            reservedStock: true,
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                provider: {
                  select: {
                    id: true,
                    companyName: true,
                  },
                },
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            product: {
              name: 'asc',
            },
          },
        },
      },
    });

    if (!warehouse) {
      throw new BadRequestException(
        'No existe un Almacén Central activo configurado como predeterminado',
      );
    }

    const providerMap = new Map<
      string,
      {
        providerId: string;
        providerName: string;
        categories: Map<
          string,
          {
            categoryId: string;
            categoryName: string;
            products: CentralInventoryProductDto[];
          }
        >;
      }
    >();

    for (const item of warehouse.stocks) {
      const { product } = item;
      const providerId = product.provider.id;
      const categoryId = product.category.id;

      let provider = providerMap.get(providerId);

      if (!provider) {
        provider = {
          providerId,
          providerName: product.provider.companyName,
          categories: new Map(),
        };
        providerMap.set(providerId, provider);
      }

      let category = provider.categories.get(categoryId);

      if (!category) {
        category = {
          categoryId,
          categoryName: product.category.name,
          products: [],
        };
        provider.categories.set(categoryId, category);
      }

      category.products.push({
        productId: product.id,
        code: this.productCode(product.id),
        name: product.name,
        unit: product.unit,
        stock: this.roundQuantity(item.stock),
        reservedStock: this.roundQuantity(item.reservedStock),
        availableStock: this.roundQuantity(
          Math.max(item.stock - item.reservedStock, 0),
        ),
      });
    }

    const providers: CentralInventoryProviderDto[] = Array.from(
      providerMap.values(),
    )
      .sort((left, right) =>
        left.providerName.localeCompare(right.providerName, 'es'),
      )
      .map((provider) => {
        const categories: CentralInventoryCategoryDto[] = Array.from(
          provider.categories.values(),
        )
          .sort((left, right) =>
            left.categoryName.localeCompare(right.categoryName, 'es'),
          )
          .map((category) => ({
            ...category,
            products: category.products.sort((left, right) =>
              left.name.localeCompare(right.name, 'es'),
            ),
            totalStock: this.roundQuantity(
              category.products.reduce(
                (sum, product) => sum + product.stock,
                0,
              ),
            ),
            totalReservedStock: this.roundQuantity(
              category.products.reduce(
                (sum, product) => sum + product.reservedStock,
                0,
              ),
            ),
            totalAvailableStock: this.roundQuantity(
              category.products.reduce(
                (sum, product) => sum + product.availableStock,
                0,
              ),
            ),
          }));

        return {
          providerId: provider.providerId,
          providerName: provider.providerName,
          categories,
          totalProducts: categories.reduce(
            (sum, category) => sum + category.products.length,
            0,
          ),
          totalStock: this.roundQuantity(
            categories.reduce((sum, category) => sum + category.totalStock, 0),
          ),
          totalReservedStock: this.roundQuantity(
            categories.reduce(
              (sum, category) => sum + category.totalReservedStock,
              0,
            ),
          ),
          totalAvailableStock: this.roundQuantity(
            categories.reduce(
              (sum, category) => sum + category.totalAvailableStock,
              0,
            ),
          ),
        };
      });

    return {
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
      },
      providers,
      generatedAt: new Date(),
      totalProducts: providers.reduce(
        (sum, provider) => sum + provider.totalProducts,
        0,
      ),
      totalStock: this.roundQuantity(
        providers.reduce((sum, provider) => sum + provider.totalStock, 0),
      ),
      totalReservedStock: this.roundQuantity(
        providers.reduce(
          (sum, provider) => sum + provider.totalReservedStock,
          0,
        ),
      ),
      totalAvailableStock: this.roundQuantity(
        providers.reduce(
          (sum, provider) => sum + provider.totalAvailableStock,
          0,
        ),
      ),
    };
  }

  async generateInventoryPDF(
    userId: number,
  ): Promise<{ pdfUrl: string; historyId: string }> {
    const inventory = await this.getInventory();
    const html = this.buildInventoryHTML(inventory);
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
          top: '18mm',
          right: '12mm',
          bottom: '18mm',
          left: '12mm',
        },
      });

      const filename = `inventario-almacen-central-${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19)}.pdf`;
      const uploadDir = path.join(process.cwd(), 'uploads', 'reports');

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      fs.writeFileSync(path.join(uploadDir, filename), pdfBuffer);

      const pdfUrl = `/uploads/reports/${filename}`;
      const history = await this.prisma.reportHistory.create({
        data: {
          type: $Enums.ReportType.INVENTORY_GENERAL,
          title: 'Inventario del Almacén Central',
          parameters: JSON.stringify({
            warehouseId: inventory.warehouse.id,
            onlyPositiveStock: true,
            includesPrices: false,
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
    return this.prisma.reportHistory.findMany({
      where: {
        type: $Enums.ReportType.INVENTORY_GENERAL,
        ...(userId ? { userId } : {}),
      },
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

  private buildInventoryHTML(inventory: InventoryResponseDto): string {
    const providersHTML = inventory.providers
      .map((provider) => {
        const categoriesHTML = provider.categories
          .map((category) => {
            const rows = category.products
              .map(
                (product) => `
                  <tr>
                    <td>${this.escapeHtml(product.code)}</td>
                    <td>${this.escapeHtml(product.name)}</td>
                    <td class="number">${product.stock}</td>
                    <td class="number">${product.reservedStock}</td>
                    <td class="number">${product.availableStock}</td>
                  </tr>
                `,
              )
              .join('');

            return `
              <section class="category">
                <h3>${this.escapeHtml(category.categoryName)}</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Producto</th>
                      <th>Stock actual</th>
                      <th>Reservado</th>
                      <th>Disponible</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows}
                    <tr class="subtotal">
                      <td colspan="2">Subtotal ${this.escapeHtml(
                        category.categoryName,
                      )}</td>
                      <td class="number">${category.totalStock}</td>
                      <td class="number">${category.totalReservedStock}</td>
                      <td class="number">${category.totalAvailableStock}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            `;
          })
          .join('');

        return `
          <section class="provider">
            <h2>${this.escapeHtml(provider.providerName)}</h2>
            ${categoriesHTML}
          </section>
        `;
      })
      .join('');

    const generatedAt = new Intl.DateTimeFormat('es-BO', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/La_Paz',
    }).format(inventory.generatedAt);

    return `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #1f2937;
              font-family: Arial, sans-serif;
              font-size: 10px;
            }
            header {
              border-bottom: 3px solid #07553d;
              margin-bottom: 18px;
              padding-bottom: 12px;
              text-align: center;
            }
            h1 { color: #07553d; font-size: 22px; margin: 0 0 6px; }
            header p { margin: 3px 0; }
            .summary {
              background: #eef8f3;
              border: 1px solid #badbcd;
              border-radius: 6px;
              display: grid;
              gap: 8px;
              grid-template-columns: repeat(4, 1fr);
              margin-bottom: 18px;
              padding: 10px;
              text-align: center;
            }
            .summary strong { display: block; font-size: 15px; margin-top: 3px; }
            .provider { break-inside: avoid; margin-bottom: 20px; }
            .provider h2 {
              background: #07553d;
              color: white;
              font-size: 15px;
              margin: 0;
              padding: 8px 10px;
            }
            .category { break-inside: avoid; margin-top: 10px; }
            .category h3 {
              background: #e5e7eb;
              font-size: 12px;
              margin: 0;
              padding: 6px 8px;
            }
            table { border-collapse: collapse; table-layout: fixed; width: 100%; }
            th, td { border: 1px solid #cbd5e1; padding: 6px; }
            th { background: #f8fafc; text-align: left; }
            th:first-child, td:first-child { width: 17%; }
            th:nth-child(n+3), td:nth-child(n+3) { width: 15%; }
            .number { text-align: right; }
            .subtotal { background: #f1f5f9; font-weight: bold; }
            .empty { color: #64748b; padding: 30px; text-align: center; }
            footer {
              border-top: 1px solid #cbd5e1;
              color: #64748b;
              margin-top: 20px;
              padding-top: 8px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <header>
            <h1>INVENTARIO DEL ALMACÉN CENTRAL</h1>
            <p><strong>${this.escapeHtml(inventory.warehouse.name)}</strong></p>
            <p>Generado: ${this.escapeHtml(generatedAt)}</p>
          </header>

          <div class="summary">
            <div>Productos<strong>${inventory.totalProducts}</strong></div>
            <div>Stock actual<strong>${inventory.totalStock}</strong></div>
            <div>Reservado<strong>${inventory.totalReservedStock}</strong></div>
            <div>Disponible<strong>${inventory.totalAvailableStock}</strong></div>
          </div>

          ${
            providersHTML ||
            '<div class="empty">No existen productos con stock mayor que cero en el Almacén Central.</div>'
          }

          <footer>
            Reporte sin precios — Sistema de Ventas e Inventarios
          </footer>
        </body>
      </html>
    `;
  }
}
