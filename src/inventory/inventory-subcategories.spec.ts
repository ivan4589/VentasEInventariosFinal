import { groupInventorySubcategories } from './inventory-subcategories';
import { CentralInventoryProductDto } from './dto/inventory-response.dto';

const product = (id: string, subCategoryId: string | null, stock: number, reservedStock: number): CentralInventoryProductDto => ({
  productId: id, code: id, name: `Figura ${id}`, unit: 'UNIDAD', subCategoryId,
  subCategoryName: subCategoryId ? 'Fideo arroba' : null, stock, reservedStock,
  availableStock: Math.max(stock - reservedStock, 0),
});
describe('subcategorías de inventario sin sustituir productos', () => {
  it('suma físico, reservado y disponible conservando todas las figuras', () => {
    const rows = [product('a', 's', 10, 2), product('b', 's', 5, 1), product('c', 's', 3, 0)];
    const result = groupInventorySubcategories(rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ totalStock: 18, totalReservedStock: 3, totalAvailableStock: 15 });
    expect(result[0].products).toEqual(rows);
  });
  it('mantiene el grupo interno Sin subcategoría y cada fila individual', () => {
    expect(groupInventorySubcategories([product('a', null, 2, 0), product('b', null, 3, 0)])[0])
      .toMatchObject({ subCategoryId: null, subCategoryName: 'Sin subcategoría', products: expect.arrayContaining([expect.objectContaining({ productId: 'a' }), expect.objectContaining({ productId: 'b' })]) });
  });
  it('no une entidades distintas por tener el mismo nombre', () => {
    expect(groupInventorySubcategories([product('a', 's1', 2, 0), product('b', 's2', 3, 0)])).toHaveLength(2);
  });
  it('la suma disponible corresponde a las filas y no se recalcula globalmente', () => {
    const group = groupInventorySubcategories([product('a', 's', 2, 4), product('b', 's', 10, 0)])[0];
    expect(group.totalAvailableStock).toBe(10);
  });
  it('las agrupaciones de dos almacenes se calculan por separado', () => {
    const central = groupInventorySubcategories([product('a', 's', 10, 2)])[0];
    const deposit = groupInventorySubcategories([product('a', 's', 50, 0)])[0];
    expect(central.totalStock).toBe(10);
    expect(central.totalAvailableStock).toBe(8);
    expect(deposit.totalStock).toBe(50);
  });
});
