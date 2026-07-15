import { IsUUID, IsNumber, IsPositive } from 'class-validator';

export class SaleDetailDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @IsPositive()
  unitPrice: number; // Precio al momento de la venta
}