import { IsNumber, IsPositive, IsString } from 'class-validator';

export class PurchaseDetailDto {
  @IsString()
  productId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @IsPositive()
  unitPrice: number;
}