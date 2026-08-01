import { Global, Module } from '@nestjs/common';
import { EconomicIntegrityService } from './economic-integrity.service';

@Global()
@Module({
  providers: [EconomicIntegrityService],
  exports: [EconomicIntegrityService],
})
export class EconomicIntegrityModule {}
