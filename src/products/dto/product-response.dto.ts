export class ProductResponseDto {
  id: string;
  code: string;
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
  isActive: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
