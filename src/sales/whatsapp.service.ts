import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { $Enums, WhatsAppSendStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';

interface WhatsAppConfiguration {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
  templateName: string;
  templateLanguage: string;
}

interface MetaApiResponse {
  id?: string;
  messages?: Array<{
    id?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

export interface SendSaleWhatsAppResult {
  saleId: string;
  status: 'SENT';
  phoneNumber: string;
  messageId: string;
  sentAt: Date;
}

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storage: ObjectStorageService,
  ) {}

  normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');

    if (!digits) {
      throw new BadRequestException('El cliente no tiene un teléfono válido');
    }

    const countryCode =
      this.configService.get<string>('WHATSAPP_DEFAULT_COUNTRY_CODE') || '591';

    if (digits.length === 8) {
      return `${countryCode}${digits}`;
    }

    if (
      digits.startsWith(countryCode) &&
      digits.length === countryCode.length + 8
    ) {
      return digits;
    }

    throw new BadRequestException(
      `El teléfono debe tener 8 dígitos o incluir el código de país ${countryCode}`,
    );
  }

  private getConfiguration(): WhatsAppConfiguration {
    const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.configService.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );

    if (!accessToken || !phoneNumberId) {
      throw new ServiceUnavailableException(
        'WhatsApp no está configurado. Revisa el token y el identificador del número en el backend.',
      );
    }

    return {
      accessToken,
      phoneNumberId,
      graphApiVersion:
        this.configService.get<string>('WHATSAPP_GRAPH_API_VERSION') || 'v25.0',
      templateName:
        this.configService.get<string>('WHATSAPP_TEMPLATE_NAME') ||
        'nota_venta_pdf',
      templateLanguage:
        this.configService.get<string>('WHATSAPP_TEMPLATE_LANGUAGE') || 'es',
    };
  }

  private async readMetaResponse(response: Response): Promise<MetaApiResponse> {
    const data = (await response.json().catch(() => ({}))) as MetaApiResponse;

    if (!response.ok) {
      const metaMessage =
        data.error?.message || `Meta respondió con estado ${response.status}`;

      throw new BadGatewayException(
        `No se pudo completar el envío por WhatsApp: ${metaMessage}`,
      );
    }

    return data;
  }

  private async uploadDocument(
    pdfBuffer: Buffer,
    filename: string,
    configuration: WhatsAppConfiguration,
  ): Promise<string> {
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', 'application/pdf');
    formData.append(
      'file',
      new Blob([new Uint8Array(pdfBuffer)], {
        type: 'application/pdf',
      }),
      filename,
    );

    const response = await fetch(
      `https://graph.facebook.com/${configuration.graphApiVersion}/${configuration.phoneNumberId}/media`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${configuration.accessToken}`,
        },
        body: formData,
      },
    );
    const data = await this.readMetaResponse(response);

    if (!data.id) {
      throw new BadGatewayException(
        'Meta no devolvió el identificador del PDF subido',
      );
    }

    return data.id;
  }

  private async sendTemplate(
    to: string,
    mediaId: string,
    filename: string,
    clientName: string,
    saleNumber: string,
    total: number,
    configuration: WhatsAppConfiguration,
  ): Promise<string> {
    const response = await fetch(
      `https://graph.facebook.com/${configuration.graphApiVersion}/${configuration.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${configuration.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'template',
          template: {
            name: configuration.templateName,
            language: {
              code: configuration.templateLanguage,
            },
            components: [
              {
                type: 'header',
                parameters: [
                  {
                    type: 'document',
                    document: {
                      id: mediaId,
                      filename,
                    },
                  },
                ],
              },
              {
                type: 'body',
                parameters: [
                  {
                    type: 'text',
                    text: clientName,
                  },
                  {
                    type: 'text',
                    text: saleNumber,
                  },
                  {
                    type: 'text',
                    text: total.toFixed(2),
                  },
                ],
              },
            ],
          },
        }),
      },
    );
    const data = await this.readMetaResponse(response);
    const messageId = data.messages?.[0]?.id;

    if (!messageId) {
      throw new BadGatewayException(
        'Meta no devolvió el identificador del mensaje',
      );
    }

    return messageId;
  }

  private getErrorMessage(error: unknown): string {
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return error.message.slice(0, 1000);
    }

    return 'Error desconocido al enviar la nota de venta';
  }

  async sendSaleDocument(
    saleId: string,
    userId: number,
    resend = false,
  ): Promise<SendSaleWhatsAppResult> {
    const sale = await this.prisma.sale.findUnique({
      where: {
        id: saleId,
      },
      include: {
        client: true,
        whatsappLogs: {
          where: {
            status: WhatsAppSendStatus.SENT,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    if (sale.status !== $Enums.SaleStatus.CONFIRMED) {
      throw new BadRequestException(
        'Solo se puede enviar una venta confirmada',
      );
    }

    if (!sale.client.whatsappConsent) {
      throw new BadRequestException(
        'El cliente no autorizó recibir documentos por WhatsApp',
      );
    }

    if (!sale.client.phone) {
      throw new BadRequestException('El cliente no tiene teléfono registrado');
    }

    if (!sale.pdfUrl) {
      throw new BadRequestException(
        'La venta todavía no tiene un PDF disponible',
      );
    }

    if (sale.whatsappLogs.length && !resend) {
      throw new ConflictException(
        'La nota de venta ya fue enviada. Confirma el reenvío para volver a enviarla.',
      );
    }

    const phoneNumber = this.normalizePhone(sale.client.phone);

    try {
      const configuration = this.getConfiguration();
      const pdfBuffer = await this.storage.readPrivate(sale.pdfUrl);
      const filename = `nota-venta-${sale.saleNumber.replace(
        /[^\w-]/g,
        '_',
      )}.pdf`;
      const mediaId = await this.uploadDocument(
        pdfBuffer,
        filename,
        configuration,
      );
      const messageId = await this.sendTemplate(
        phoneNumber,
        mediaId,
        filename,
        sale.client.fullName,
        sale.saleNumber,
        sale.total,
        configuration,
      );
      const log = await this.prisma.saleWhatsAppLog.create({
        data: {
          saleId,
          userId,
          phoneNumber,
          status: WhatsAppSendStatus.SENT,
          metaMessageId: messageId,
        },
      });

      return {
        saleId,
        status: 'SENT',
        phoneNumber,
        messageId,
        sentAt: log.createdAt,
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);

      await this.prisma.saleWhatsAppLog
        .create({
          data: {
            saleId,
            userId,
            phoneNumber,
            status: WhatsAppSendStatus.FAILED,
            errorMessage,
          },
        })
        .catch(() => undefined);

      throw error;
    }
  }
}
