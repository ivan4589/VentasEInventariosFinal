export class ProductResponseDto {
  id: string;
  name: string;
  description?: string;
  providerId: string;
  categoryId: string;
  subCategoryId?: string;
  weight?: string;
  purchasePrice: number;
  priceNormal: number;
  priceCamino: number;
  priceEspecial: number;
  priceMayorista?: number;
  minQuantityWholesale?: number;
  stock: number;
  centralStock?: number;
  centralReservedStock?: number;
  centralAvailableStock?: number;
  minStock: number;
  unit: string;
  reserveQuantity: number;
  additionalInfo?: string;
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
