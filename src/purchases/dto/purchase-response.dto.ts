import { $Enums } from '../../../generated/prisma/client';

export class PurchaseDetailResponseDto {
  id: string;
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  priceNormal?: number | null;
  priceCamino?: number | null;
  priceEspecial?: number | null;
  priceMayorista?: number | null;
  minQuantityWholesale?: number | null;
}

export class PurchaseProviderResponseDto {
  id: string;
  providerId: string;
  providerName: string;
  status: $Enums.PurchaseProviderStatus;
  total: number;
  receivedAt?: Date;
  cancelledAt?: Date;
  details: PurchaseDetailResponseDto[];
}

export class PurchaseResponseDto {
  id: string;
  userId: number;
  userName: string;
  date: Date;
  status: $Enums.PurchaseStatus;
  total: number;
  observations?: string;
  pdfUrl?: string;
  providerGroups: PurchaseProviderResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}