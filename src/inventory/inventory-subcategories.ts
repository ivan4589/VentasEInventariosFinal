import { CentralInventoryProductDto, CentralInventorySubCategoryDto } from './dto/inventory-response.dto';

/** Solo presentación del inventario de un almacén: conserva las filas individuales. */
export function groupInventorySubcategories(products: readonly CentralInventoryProductDto[]): CentralInventorySubCategoryDto[] {
  const groups = new Map<string | null, CentralInventorySubCategoryDto>();
  const round = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;
  for (const product of products) {
    const key = product.subCategoryId ?? null;
    const group = groups.get(key) ?? {
      subCategoryId: key, subCategoryName: key ? (product.subCategoryName || 'Subcategoría') : 'Sin subcategoría',
      products: [], totalStock: 0, totalReservedStock: 0, totalAvailableStock: 0,
    };
    group.products.push(product);
    group.totalStock = round(group.totalStock + product.stock);
    group.totalReservedStock = round(group.totalReservedStock + product.reservedStock);
    group.totalAvailableStock = round(group.totalAvailableStock + product.availableStock);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.subCategoryName.localeCompare(b.subCategoryName, 'es') ||
    (a.subCategoryId || '').localeCompare(b.subCategoryId || '', 'es'),
  );
}
