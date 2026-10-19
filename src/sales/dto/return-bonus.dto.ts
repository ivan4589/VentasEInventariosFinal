import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

export class ReturnBonusDetailDto {
  @IsString()
  bonusDetailId: string;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class ReturnBonusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({each:true})
  @Type(() => ReturnBonusDetailDto)
  bonuses: ReturnBonusDetailDto[];
}
