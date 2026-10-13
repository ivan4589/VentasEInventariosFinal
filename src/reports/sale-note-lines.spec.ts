import { BadRequestException } from '@nestjs/common';
import { buildSaleNoteLines, SaleNoteDetail } from './sale-note-lines';

const detail = (id: string, quantity = 1, price: number | string = 180, subtotal: number | string = 180, category: { id: string; name: string } | null = { id: 's', name: 'Fideo arroba' }): SaleNoteDetail => ({
  productId: id, quantity, unitPrice: price, subtotal, product: { name: `Figura ${id}`, subCategory: category },
});
describe('líneas exclusivas de la nota del cliente', () => {
  it('tres figuras generan una línea con cantidad entera y subtotal original exacto', () => {
    const result = buildSaleNoteLines([detail('a', 2, 180, 360), detail('b'), detail('c', 3, 180, 540)]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Fideo arroba');
    expect(result[0].quantity).toBe(6);
    expect(result[0].unitPrice?.toString()).toBe('180');
    expect(result[0].subtotal.toFixed(2)).toBe('1080.00');
  });
  it('precios diferentes agrupan cantidades y subtotales sin calcular promedio', () => {
    const line = buildSaleNoteLines([detail('a', 1, 185, 185), detail('b', 2, 180, 360)])[0];
    expect(line.quantity).toBe(3);
    expect(line.unitPrice).toBeNull();
    expect(line.subtotal.toFixed(2)).toBe('545.00');
  });
  it('suma décimas con Decimal, no con aritmética binaria', () => {
    expect(buildSaleNoteLines([detail('a', 1, '0.1', '0.1'), detail('b', 1, '0.2', '0.2')])[0].subtotal.toString()).toBe('0.3');
  });
  it('conserva subtotales reales, no multiplica cantidad por precio redondeado', () => {
    expect(buildSaleNoteLines([detail('a', 3, '1.3333', '4.00'), detail('b', 3, '1.3333', '4.00')])[0].subtotal.toFixed(2)).toBe('8.00');
  });
  it('cada producto sin subcategoría conserva su nombre y línea', () => {
    const result = buildSaleNoteLines([detail('a', 1, 10, 10, null), detail('b', 1, 10, 10, null)]);
    expect(result.map(row => row.name)).toEqual(['Figura a', 'Figura b']);
    expect(result.map(row => row.key)).toEqual(['product:a', 'product:b']);
    expect(result).toHaveLength(2);
  });
  it('no agrupa por nombre ni por coincidencia aproximada', () => {
    const result = buildSaleNoteLines([detail('a', 1, 10, 10, { id: '1', name: 'Fideo arroba' }), detail('b', 1, 10, 10, { id: '2', name: 'Fideo arroba' })]);
    expect(result).toHaveLength(2);
  });
  it('la clave de respaldo no colisiona con un ID de subcategoría', () => {
    expect(buildSaleNoteLines([detail('s', 1, 10, 10, null), detail('a')])).toHaveLength(2);
  });
  it('una subcategoría vacía o inválida no crea etiquetas artificiales en el PDF', () => {
    expect(buildSaleNoteLines([detail('a', 1, 10, 10, { id: 'x', name: '  ' })])[0].name).toBe('Figura a');
  });
  it('el orden es estable independientemente del orden de entrada', () => {
    const rows = [detail('z', 1, 10, 10, null), detail('a'), detail('b', 1, 10, 10, { id: '2', name: 'Arroz' })];
    expect(buildSaleNoteLines(rows).map(r => r.key)).toEqual(buildSaleNoteLines([...rows].reverse()).map(r => r.key));
  });
  it('no muta ni los detalles originales ni las cantidades y precios', () => {
    const rows = [detail('a'), detail('b')];
    const original = JSON.stringify(rows);
    rows.forEach(row => { Object.freeze(row.product); Object.freeze(row); });
    Object.freeze(rows);
    buildSaleNoteLines(rows);
    expect(JSON.stringify(rows)).toBe(original);
  });
  it('no altera descuento, pagos, saldo ni total de la venta', () => {
    const sale = Object.freeze({ details: [detail('a'), detail('b')], total: 345, discount: 15, paidAmount: 100, balance: 245 });
    buildSaleNoteLines(sale.details);
    expect(sale).toEqual({ details: [detail('a'), detail('b')], total: 345, discount: 15, paidAmount: 100, balance: 245 });
  });
  it.each([0, -1, 1.5, NaN, Infinity])('rechaza cantidades inválidas %s', quantity => {
    expect(() => buildSaleNoteLines([detail('a', quantity)])).toThrow(BadRequestException);
  });
});
