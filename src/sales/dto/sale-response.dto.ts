import { $Enums } from '../../../generated/prisma/client';

export class SaleDetailResponseDto {
  id: string;
  productId: string;
  productName: string;
  productImageUrl?: string;
  presentation?: string;
  quantity: number;
  returnedQuantity: number;
  unitPrice: number;
  subtotal: number;
}

export class SaleResponseDto {
  id: string;
  saleNumber: string;

  clientId: string;
  clientName: string;
  clientAlias?: string;
  clientType: $Enums.ClientType;
  clientLocation?: string;
  clientPhone?: string;

  userId: number;
  userName: string;

  date: Date;
  status: $Enums.SaleStatus;
  paymentStatus: $Enums.PaymentStatus;
  saleType: $Enums.SaleType;
  dueDate?: Date;

  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  balance: number;

  observations?: string;
  pdfUrl?: string;
  cancelledPdfUrl?: string;

  details: SaleDetailResponseDto[];

  createdAt: Date;
  updatedAt: Date;
}