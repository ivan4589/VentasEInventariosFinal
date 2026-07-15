import { SaleStatus, PaymentStatus } from '@prisma/client';

export class SaleDetailResponseDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export class SaleResponseDto {
  id: string;
  saleNumber: string;
  clientId: string;
  clientName: string;
  userId: string;
  userName: string;
  date: Date;
  status: SaleStatus;
  paymentStatus: PaymentStatus;
  total: number;
  discount: number;
  observations?: string;
  pdfUrl?: string;
  details: SaleDetailResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}