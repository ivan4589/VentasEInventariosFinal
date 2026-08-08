import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DataAuditService } from './data-audit.service';
import { ObjectStorageService } from '../storage/object-storage.service';

export interface DocumentActor {
  id: number;
  role: $Enums.Role;
}

export interface ProtectedDocumentDescriptor {
  content: Buffer;
  downloadName: string;
  entityType: string;
  entityId: string;
}

@Injectable()
export class ProtectedDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: DataAuditService,
    private readonly storage: ObjectStorageService,
  ) {}

  private async descriptor(
    fileUrl: string | null | undefined,
    downloadName: string,
    entityType: string,
    entityId: string,
  ): Promise<ProtectedDocumentDescriptor> {
    if (!fileUrl) {
      throw new NotFoundException('El documento todavía no está disponible');
    }

    const content = await this.storage.readPrivate(fileUrl);
    return { content, downloadName, entityType, entityId };
  }

  async sale(
    saleId: string,
    cancelled: boolean,
  ): Promise<ProtectedDocumentDescriptor> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        saleNumber: true,
        pdfUrl: true,
        cancelledPdfUrl: true,
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    return this.descriptor(
      cancelled ? sale.cancelledPdfUrl : sale.pdfUrl,
      `${cancelled ? 'nota-venta-anulada' : 'nota-venta'}-${sale.saleNumber}.pdf`,
      'SALE_DOCUMENT',
      sale.id,
    );
  }

  async purchase(purchaseId: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: { id: true, pdfUrl: true, date: true },
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    return this.descriptor(
      purchase.pdfUrl,
      `comprobante-compra-${purchase.id}.pdf`,
      'PURCHASE_DOCUMENT',
      purchase.id,
    );
  }

  async report(historyId: string, actor: DocumentActor) {
    const history = await this.prisma.reportHistory.findUnique({
      where: { id: historyId },
    });
    if (!history) {
      throw new NotFoundException('Historial de reporte no encontrado');
    }
    if (actor.role !== $Enums.Role.ADMIN && history.userId !== actor.id) {
      throw new ForbiddenException(
        'No tienes permiso para descargar este reporte',
      );
    }
    return this.descriptor(
      history.fileUrl,
      `${history.title.replace(/[^a-zA-Z0-9-_áéíóúÁÉÍÓÚñÑ ]/g, '')}.pdf`,
      'REPORT_DOCUMENT',
      history.id,
    );
  }

  async recordDownload(
    actor: DocumentActor,
    descriptor: ProtectedDocumentDescriptor,
  ) {
    await this.audit.record({
      userId: actor.id,
      action: 'DOCUMENT_DOWNLOADED',
      entityType: descriptor.entityType,
      entityId: descriptor.entityId,
    });
  }
}
