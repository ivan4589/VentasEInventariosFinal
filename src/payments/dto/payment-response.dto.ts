import { PaymentMethod, SaleStatus } from '@prisma/client';

export class PaymentResponseDto {
  id: string;
  saleId: string;
  clientId: string;
  clientName: string;
  userId: string;
  userName: string;
  amount: number;
  method: PaymentMethod;
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
  status: SaleStatus;
}