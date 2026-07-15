import { IsUUID, IsNumber, IsPositive } from 'class-validator';

export class PurchaseDetailDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @IsPositive()
  unitPrice: number;
}