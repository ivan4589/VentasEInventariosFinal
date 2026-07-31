import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { AdminStepUpDto } from '../../auth/dto/admin-step-up.dto';

export class ResetUserPasswordDto {
  @ValidateNested()
  @Type(() => AdminStepUpDto)
  confirmation: AdminStepUpDto;
}
