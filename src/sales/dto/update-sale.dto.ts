import { IsOptional, IsString, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { SaleDetailDto } from './sale-detail.dto';

export class UpdateSaleDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleDetailDto)
  details?: SaleDetailDto[];

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsString()
  observations?: string;
}