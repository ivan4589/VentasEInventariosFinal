import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DataAuditService } from './data-audit.service';
import { ProtectedDocumentsController } from './protected-documents.controller';
import { ProtectedDocumentsService } from './protected-documents.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [ProtectedDocumentsController],
  providers: [DataAuditService, ProtectedDocumentsService],
  exports: [DataAuditService, ProtectedDocumentsService],
})
export class DataProtectionModule {}
