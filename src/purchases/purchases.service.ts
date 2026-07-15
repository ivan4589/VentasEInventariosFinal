import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { ReceivePurchaseDto } from './dto/receive-purchase.dto';
import { PurchaseResponseDto } from './dto/purchase-response.dto';
import { ReportsService } from '../reports/reports.service';


@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  private toResponse(purchase: any): PurchaseResponseDto {
    return {
      id: purchase.id,
      providerId: purchase.providerId,
      providerName: purchase.provider?.companyName || '',
      userId: purchase.userId,
      userName: purchase.user?.name || '',
      date: purchase.date,
      status: purchase.status,
      total: purchase.total,
      observations: purchase.observations,
      pdfUrl: purchase.pdfUrl,
      details:
        purchase.details?.map((detail) => ({
          id: detail.id,
          productId: detail.productId,
          productName: detail.product?.name || '',
          quantity: detail.quantity,
          unitPrice: detail.unitPrice,
          subtotal: detail.subtotal,
        })) || [],
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
    };
  }

  async create(
    createPurchaseDto: CreatePurchaseDto,
    userId: number,
  ): Promise<PurchaseResponseDto> {
    const { providerId, observations, details } = createPurchaseDto;

    if (!details || details.length === 0) {
      throw new BadRequestException('La compra debe tener al menos un detalle');
    }

    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    const productIds = details.map((detail) => detail.productId);

    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('Algunos productos no existen');
    }

    const total = details.reduce(
      (sum, detail) => sum + detail.quantity * detail.unitPrice,
      0,
    );

    const purchase = await this.prisma.purchase.create({
      data: {
        providerId,
        userId,
        observations,
        total,
        details: {
          create: details.map((detail) => ({
            productId: detail.productId,
            quantity: detail.quantity,
            unitPrice: detail.unitPrice,
            subtotal: detail.quantity * detail.unitPrice,
          })),
        },
      },
      include: {
        provider: true,
        user: true,
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    return this.toResponse(purchase);
  }

  async receive(
    id: string,
    receiveDto: ReceivePurchaseDto,
    userId: number,
  ): Promise<PurchaseResponseDto> {
    const { updatePrices = true } = receiveDto;

    return this.prisma.$transaction(async (prisma) => {
      const purchase = await prisma.purchase.findUnique({
        where: { id },
        include: {
          provider: true,
          user: true,
          details: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!purchase) {
        throw new NotFoundException('Compra no encontrada');
      }

      if (purchase.status !== $Enums.PurchaseStatus.PENDING) {
        throw new BadRequestException(
          'Solo se puede recibir compras en estado PENDIENTE',
        );
      }

      for (const detail of purchase.details) {
        const product = detail.product;

        const updateData: any = {
          stock: product.stock + detail.quantity,
          purchasePrice: detail.unitPrice,
        };

        if (updatePrices) {
          updateData.priceNormal =
            detail.unitPrice * (1 + product.markupNormal / 100);
          updateData.priceCamino =
            detail.unitPrice * (1 + product.markupCamino / 100);
          updateData.priceEspecial =
            detail.unitPrice * (1 + product.markupEspecial / 100);

          if (product.priceMayorista !== null) {
            updateData.priceMayorista =
              detail.unitPrice * (1 + product.markupMayorista / 100);
          }
        }

        await prisma.product.update({
          where: { id: detail.productId },
          data: updateData,
        });
      }

      const updated = await prisma.purchase.update({
        where: { id },
        data: {
          status: $Enums.PurchaseStatus.RECEIVED,
        },
        include: {
          provider: true,
          user: true,
          details: {
            include: {
              product: {
                include: {
                  category: true,
                },
              },
            },
          },
        },
      });

      let pdfUrl: string | null = null;

      try {
      pdfUrl = await this.reportsService.generatePurchasePDF(updated.id);
      } catch (error) {
        console.error('Error generando PDF de compra:', error);
      }

      const updatedWithPdf = await prisma.purchase.update({
        where: { id },
        data: {
        pdfUrl: pdfUrl ?? undefined,
      },
        include: {
        provider: true,
        user: true,
        details: {
        include: {
        product: {
          include: {
            category: true,
          },
        },
      },
    },
  },
});

return this.toResponse(updatedWithPdf);
    });
  }

  async update(
    id: string,
    updatePurchaseDto: UpdatePurchaseDto,
  ): Promise<PurchaseResponseDto> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        details: true,
      },
    });

    if (!purchase) {
      throw new NotFoundException('Compra no encontrada');
    }

    if (purchase.status !== $Enums.PurchaseStatus.PENDING) {
      throw new BadRequestException(
        'Solo se pueden editar compras en estado PENDIENTE',
      );
    }

    const { observations, details } = updatePurchaseDto;

    let total = purchase.total;

    if (details) {
      if (details.length === 0) {
        throw new BadRequestException('La compra debe tener al menos un detalle');
      }

      const productIds = details.map((detail) => detail.productId);

      const products = await this.prisma.product.findMany({
        where: {
          id: {
            in: productIds,
          },
        },
      });

      if (products.length !== productIds.length) {
        throw new BadRequestException('Algunos productos no existen');
      }

      await this.prisma.purchaseDetail.deleteMany({
        where: {
          purchaseId: id,
        },
      });

      const newDetails = details.map((detail) => ({
        productId: detail.productId,
        quantity: detail.quantity,
        unitPrice: detail.unitPrice,
        subtotal: detail.quantity * detail.unitPrice,
      }));

      total = newDetails.reduce((sum, detail) => sum + detail.subtotal, 0);

      await this.prisma.purchaseDetail.createMany({
        data: newDetails.map((detail) => ({
          ...detail,
          purchaseId: id,
        })),
      });
    }

    const updated = await this.prisma.purchase.update({
      where: { id },
      data: {
        observations:
          observations !== undefined ? observations : purchase.observations,
        total,
      },
      include: {
        provider: true,
        user: true,
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    return this.toResponse(updated);
  }

  async cancel(id: string): Promise<PurchaseResponseDto> {
    return this.prisma.$transaction(async (prisma) => {
      const purchase = await prisma.purchase.findUnique({
        where: { id },
        include: {
          provider: true,
          user: true,
          details: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!purchase) {
        throw new NotFoundException('Compra no encontrada');
      }

      if (purchase.status === $Enums.PurchaseStatus.CANCELLED) {
        throw new BadRequestException('La compra ya está anulada');
      }

      if (purchase.status === $Enums.PurchaseStatus.RECEIVED) {
        for (const detail of purchase.details) {
          const product = detail.product;
          const newStock = product.stock - detail.quantity;

          if (newStock < 0) {
            throw new BadRequestException(
              `No se puede anular la compra porque el producto "${product.name}" quedaría con stock negativo`,
            );
          }

          await prisma.product.update({
            where: {
              id: detail.productId,
            },
            data: {
              stock: newStock,
            },
          });
        }
      }

      const cancelled = await prisma.purchase.update({
        where: { id },
        data: {
          status: $Enums.PurchaseStatus.CANCELLED,
        },
        include: {
          provider: true,
          user: true,
          details: {
            include: {
              product: true,
            },
          },
        },
      });

      return this.toResponse(cancelled);
    });
  }

  async findAll(filters?: {
    status?: $Enums.PurchaseStatus;
    providerId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<PurchaseResponseDto[]> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.providerId) {
      where.providerId = filters.providerId;
    }

    if (filters?.dateFrom || filters?.dateTo) {
      where.date = {};

      if (filters.dateFrom) {
        where.date.gte = filters.dateFrom;
      }

      if (filters.dateTo) {
        where.date.lte = filters.dateTo;
      }
    }

    const purchases = await this.prisma.purchase.findMany({
      where,
      include: {
        provider: true,
        user: true,
        details: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    return purchases.map((purchase) => this.toResponse(purchase));
  }

  async findOne(id: string): Promise<PurchaseResponseDto> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        provider: true,
        user: true,
        details: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundException('Compra no encontrada');
    }

    return this.toResponse(purchase);
  }
}