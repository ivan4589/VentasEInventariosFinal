export class InventoryItemDto {
  productId: string;
  name: string;
  category: string;
  categoryId: string;
  stock: number;
  unit: string;
  minStock: number;
}

export class InventoryResponseDto {
  items: InventoryItemDto[];
  generatedAt: Date;
  totalProducts: number;
  totalStock: number;
  lowStockProducts: number;
}