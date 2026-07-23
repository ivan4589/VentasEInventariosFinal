import { Type } from 'class-transformer';
import { IsNumber, IsPositive, IsString } from 'class-validator';

export class PurchaseWarehouseDistributionDto {
  @IsString()
  warehouseId: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity: number;
}
