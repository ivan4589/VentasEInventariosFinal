import { Type } from 'class-transformer';
import { IsInt, IsString, Min } from 'class-validator';

export class BonusAllocationDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
