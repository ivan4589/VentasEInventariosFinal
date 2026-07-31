import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SaleReturnDetailDto {
  @IsString()
  @IsNotEmpty()
  saleDetailId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateSaleReturnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleReturnDetailDto)
  details: SaleReturnDetailDto[];

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  observations: string;
}
