import { $Enums } from '../../../generated/prisma/client';

export class PaymentResponseDto {
  id: string;
  saleId: string;
  clientId: string;
  clientName: string;
  userId: number;
  userName: string;
  amount: number;
  method: $Enums.PaymentMethod;
  reference?: string;
  observations?: string;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class SalePaymentStatusDto {
  saleId: string;
  total: number;
  paid: number;
  balance: number;
  saleStatus: $Enums.SaleStatus;
  paymentStatus: $Enums.PaymentStatus;
}