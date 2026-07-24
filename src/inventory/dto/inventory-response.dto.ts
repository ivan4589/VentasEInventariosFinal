export class CentralInventoryProductDto {
  productId: string;
  code: string;
  name: string;
  unit: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
}

export class CentralInventoryCategoryDto {
  categoryId: string;
  categoryName: string;
  products: CentralInventoryProductDto[];
  totalStock: number;
  totalReservedStock: number;
  totalAvailableStock: number;
}

export class CentralInventoryProviderDto {
  providerId: string;
  providerName: string;
  categories: CentralInventoryCategoryDto[];
  totalProducts: number;
  totalStock: number;
  totalReservedStock: number;
  totalAvailableStock: number;
}

export class InventoryResponseDto {
  warehouse: {
    id: string;
    name: string;
    code: string;
  };
  providers: CentralInventoryProviderDto[];
  generatedAt: Date;
  totalProducts: number;
  totalStock: number;
  totalReservedStock: number;
  totalAvailableStock: number;
}
