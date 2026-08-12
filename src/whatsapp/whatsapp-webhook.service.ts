import { Injectable } from '@nestjs/common';
import { WhatsAppSendStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type MetaDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

interface MetaWebhookError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: {
    details?: string;
  };
}

interface MetaWebhookStatus {
  id?: string;
  status?: string;
  errors?: MetaWebhookError[];
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: MetaWebhookStatus[];
      };
    }>;
  }>;
}

const STATUS_MAP: Record<MetaDeliveryStatus, WhatsAppSendStatus> = {
  sent: WhatsAppSendStatus.SENT,
  delivered: WhatsAppSendStatus.DELIVERED,
  read: WhatsAppSendStatus.READ,
  failed: WhatsAppSendStatus.FAILED,
};

@Injectable()
export class WhatsappWebhookService {
  constructor(private readonly prisma: PrismaService) {}

  private isDeliveryStatus(value: string): value is MetaDeliveryStatus {
    return Object.prototype.hasOwnProperty.call(STATUS_MAP, value);
  }

  private allowedCurrentStatuses(
    status: WhatsAppSendStatus,
  ): WhatsAppSendStatus[] {
    switch (status) {
      case WhatsAppSendStatus.DELIVERED:
        return [WhatsAppSendStatus.SENT, WhatsAppSendStatus.DELIVERED];
      case WhatsAppSendStatus.READ:
        return [
          WhatsAppSendStatus.SENT,
          WhatsAppSendStatus.DELIVERED,
          WhatsAppSendStatus.READ,
        ];
      case WhatsAppSendStatus.FAILED:
        return [
          WhatsAppSendStatus.SENT,
          WhatsAppSendStatus.DELIVERED,
          WhatsAppSendStatus.FAILED,
        ];
      default:
        return [WhatsAppSendStatus.SENT];
    }
  }

  private errorMessage(errors: MetaWebhookError[] | undefined): string | null {
    if (!errors?.length) return null;

    return errors
      .map((error) =>
        [
          error.code ? `Meta ${error.code}` : undefined,
          error.title,
          error.message,
          error.error_data?.details,
        ]
          .filter(Boolean)
          .join(': '),
      )
      .filter(Boolean)
      .join(' | ')
      .slice(0, 1000);
  }

  async process(payload: unknown): Promise<number> {
    if (!payload || typeof payload !== 'object') return 0;

    const webhook = payload as MetaWebhookPayload;
    const statuses =
      webhook.entry?.flatMap((entry) =>
        entry.changes?.flatMap((change) => change.value?.statuses ?? []) ?? [],
      ) ?? [];

    let updated = 0;

    for (const event of statuses) {
      if (
        !event.id ||
        !event.status ||
        !this.isDeliveryStatus(event.status)
      ) {
        continue;
      }

      const status = STATUS_MAP[event.status];
      const result = await this.prisma.saleWhatsAppLog.updateMany({
        where: {
          metaMessageId: event.id,
          status: {
            in: this.allowedCurrentStatuses(status),
          },
        },
        data: {
          status,
          errorMessage:
            status === WhatsAppSendStatus.FAILED
              ? this.errorMessage(event.errors) || 'Meta reportó el envío fallido'
              : null,
        },
      });

      updated += result.count;
    }

    return updated;
  }
}
