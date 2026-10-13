jest.mock('../common/pdf/render-pdf', () => ({ renderPdf: jest.fn() }));
import { $Enums } from '../../generated/prisma/client';
import { ReportsService } from './reports.service';
import { AnalyticsReportsService } from './analytics-reports.service';
import { ProtectedDocumentsService } from '../data-protection/protected-documents.service';

const products = ['a', 'b'].map(id => ({
  id, name: `Figura ${id}`, stock: 20, minStock: 0, unit: 'UNIDAD', purchasePrice: 5,
  provider: { companyName: 'Proveedor' }, category: { name: 'Fideos' }, subCategory: { id: 's', name: 'Fideo arroba' },
}));
const sale = { id: 'sale', saleNumber: 'TEST', clientId: 'client', client: { fullName: 'Cliente de prueba' },
  user: { name: 'Usuario de prueba' }, total: 50, status: 'CONFIRMED', date: new Date(), confirmedAt: new Date(),
  details: products.map((product, index) => ({ productId: product.id, product, quantity: index + 2, returnedQuantity: 0, unitPrice: 10, subtotal: (index + 2) * 10 })),
};
describe('regresiones: agrupación exclusiva de la nota', () => {
  it('el reporte de inventario general conserva filas separadas por producto', async () => {
    const prisma = { product: { findMany: jest.fn().mockResolvedValue(products) } };
    const report = await new ReportsService(prisma as any, {} as any, {} as any).getInventoryGeneral();
    expect(report.items.map(row => row.productId)).toEqual(['a', 'b']);
    expect(report.items.map(row => row.name)).toEqual(['Figura a', 'Figura b']);
  });
  it('el reporte de ventas sigue detallado por figura', async () => {
    const prisma = { sale: { findMany: jest.fn().mockResolvedValue([sale]) } };
    const report = await new AnalyticsReportsService(prisma as any, {} as any, {} as any).getReport('sales-detail', { dateFrom: '2026-10-01', dateTo: '2026-10-31' }, { id: 1, role: $Enums.Role.ADMIN });
    const rows = report.sections[0].tables[0].rows;
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.product)).toEqual(['Figura a', 'Figura b']);
  });
  it('el reporte matriz mantiene claves y cantidades de cada producto', async () => {
    const prisma = { sale: { findMany: jest.fn().mockResolvedValue([sale]) } };
    const service = new AnalyticsReportsService(prisma as any, {} as any, {} as any);
    const matrix = await (service as any).salesMatrix({});
    expect(matrix.products.map(product => product.id)).toEqual(['a', 'b']);
    expect([...matrix.clients[0].quantities.entries()]).toEqual([['a', 2], ['b', 3]]);
    const html = (service as any).buildSalesMatrixHtml(matrix);
    expect(html).toContain('Figura a');
    expect(html).toContain('Figura b');
  });
  it('descargar una nota histórica solo lee el PDF original y no regenera nada', async () => {
    const content = Buffer.from('%PDF-original-historico');
    const prisma = { sale: { findUnique: jest.fn().mockResolvedValue({ id: 'sale', saleNumber: 'OLD', pdfUrl: '/uploads/sales/original.pdf' }) } };
    const storage = { readPrivate: jest.fn().mockResolvedValue(content), savePrivatePdf: jest.fn() };
    const result = await new ProtectedDocumentsService(prisma as any, {} as any, storage as any).sale('sale', false);
    expect(result.content).toBe(content);
    expect(storage.readPrivate).toHaveBeenCalledWith('/uploads/sales/original.pdf');
    expect(storage.savePrivatePdf).not.toHaveBeenCalled();
  });
});
