import { PurchaseStatus } from '@prisma/client';

export class PurchaseDetailResponseDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export class PurchaseResponseDto {
  id: string;
  providerId: string;
  providerName: string;
  userId: string;
  userName: string;
  date: Date;
  status: PurchaseStatus;
  total: number;
  observations?: string;
  pdfUrl?: string;
  details: PurchaseDetailResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}