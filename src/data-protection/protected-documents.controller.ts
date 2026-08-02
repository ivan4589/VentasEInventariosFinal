import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import {
  AnyPermissions,
  Permissions,
} from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ProtectedDocumentDescriptor,
  ProtectedDocumentsService,
} from './protected-documents.service';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProtectedDocumentsController {
  constructor(private readonly documents: ProtectedDocumentsService) {}

  private async send(
    descriptor: ProtectedDocumentDescriptor,
    req: any,
    response: Response,
  ) {
    await this.documents.recordDownload(req.user, descriptor);
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('Pragma', 'no-cache');
    return response.download(
      descriptor.filePath,
      descriptor.downloadName,
    );
  }

  @Get('sales/:saleId')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_DOWNLOAD_ALL)
  async sale(
    @Param('saleId') saleId: string,
    @Query('cancelled') cancelled: string | undefined,
    @Request() req: any,
    @Res() response: Response,
  ) {
    const descriptor = await this.documents.sale(
      saleId,
      cancelled === 'true',
    );
    return this.send(descriptor, req, response);
  }

  @Get('purchases/:purchaseId')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PURCHASES_VIEW)
  async purchase(
    @Param('purchaseId') purchaseId: string,
    @Request() req: any,
    @Res() response: Response,
  ) {
    const descriptor = await this.documents.purchase(purchaseId);
    return this.send(descriptor, req, response);
  }

  @Get('reports/:historyId')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.REPORTS_HISTORY_ALL,
    PERMISSIONS.REPORTS_HISTORY_OWN,
  )
  async report(
    @Param('historyId') historyId: string,
    @Request() req: any,
    @Res() response: Response,
  ) {
    const descriptor = await this.documents.report(historyId, req.user);
    return this.send(descriptor, req, response);
  }
}
