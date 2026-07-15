import { $Enums } from '../../../generated/prisma/client';

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
  userId: number;
  userName: string;
  date: Date;
  status: $Enums.SaleStatus;
  paymentStatus: $Enums.PaymentStatus;
  total: number;
  discount: number;
  observations?: string;
  pdfUrl?: string;
  details: SaleDetailResponseDto[];
  createdAt: Date;
  updatedAt: Date;
  lowStockAlerts?: {
    productId: string;
    productName: string;
    currentStock: number;
    minStock: number;
  }[];
}