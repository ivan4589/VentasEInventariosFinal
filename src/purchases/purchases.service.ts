import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { PurchaseResponseDto } from './dto/purchase-response.dto';

interface PreparedDetail {
  productId: string;
  providerId: string;
  categoryId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  pricingConfigured: boolean;
  priceNormal: number;
  priceCamino: number;
  priceEspecial: number;
  priceMayorista: number | null;
  minQuantityWholesale: number | null;
}

interface PreparedProviderGroup {
  providerId: string;
  total: number;
  details: PreparedDetail[];
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  private purchaseInclude(): any {
    return {
      user: true,
      providerGroups: {
        include: {
          provider: true,
          details: {
            include: {
              product: true,
              category: true,
            },
          },
        },
      },
    };
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private calculateMarkup(
    purchasePrice: number,
    salePrice: number,
  ): number {
    if (purchasePrice <= 0) {
      return 0;
    }

    return this.roundMoney(
      (salePrice / purchasePrice - 1) * 100,
    );
  }

  private toResponse(purchase: any): PurchaseResponseDto {
    return {
      id: purchase.id,
      userId: purchase.userId,
      userName: purchase.user?.name || '',
      date: purchase.date,
      status: purchase.status,
      total: purchase.total,
      observations: purchase.observations,
      pdfUrl: purchase.pdfUrl,
      providerGroups: (purchase.providerGroups || [])
        .sort((a: any, b: any) =>
          a.provider.companyName.localeCompare(b.provider.companyName),
        )
        .map((group: any) => ({
          id: group.id,
          providerId: group.providerId,
          providerName: group.provider?.companyName || '',
          status: group.status,
          total: group.total,
          receivedAt: group.receivedAt,
          cancelledAt: group.cancelledAt,
          details: (group.details || []).map((detail: any) => ({
            id: detail.id,
            productId: detail.productId,
            productName: detail.product?.name || '',
            categoryId: detail.categoryId,
            categoryName: detail.category?.name || '',
            quantity: detail.quantity,
            unitPrice: detail.unitPrice,
            subtotal: detail.subtotal,
            priceNormal: detail.priceNormal,
            priceCamino: detail.priceCamino,
            priceEspecial: detail.priceEspecial,
            priceMayorista: detail.priceMayorista,
            minQuantityWholesale:
              detail.minQuantityWholesale,
          })),
        })),
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
    };
  }

  private async prepareProviderGroups(
    details: CreatePurchaseDto['details'],
  ): Promise<PreparedProviderGroup[]> {
    if (!details?.length) {
      throw new BadRequestException(
        'La compra debe tener al menos un producto',
      );
    }

    const productIds = details.map((detail) => detail.productId);

    const duplicatedProduct = productIds.find(
      (productId, index) => productIds.indexOf(productId) !== index,
    );

    if (duplicatedProduct) {
      throw new BadRequestException(
        'No se puede repetir el mismo producto en una compra',
      );
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
      include: {
        provider: true,
        category: true,
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'Uno o mÃ¡s productos no existen',
      );
    }

    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );

    const groupMap = new Map<string, PreparedProviderGroup>();

    for (const detail of details) {
      const product = productMap.get(detail.productId);

      if (!product) {
        throw new NotFoundException(
          `Producto ${detail.productId} no encontrado`,
        );
      }

      const subtotal = this.roundMoney(
        detail.quantity * detail.unitPrice,
      );

      const hasWholesalePrice =
        detail.priceMayorista !== null &&
        detail.priceMayorista !== undefined;

      const hasWholesaleMinimum =
        detail.minQuantityWholesale !== null &&
        detail.minQuantityWholesale !== undefined;

      if (
        hasWholesalePrice !== hasWholesaleMinimum
      ) {
        throw new BadRequestException(
          `El producto "${product.name}" debe tener precio y cantidad mÃ­nima mayorista, o dejar ambos vacÃ­os`,
        );
      }

      const preparedDetail: PreparedDetail = {
        productId: product.id,
        providerId: product.providerId,
        categoryId: product.categoryId,
        quantity: detail.quantity,
        unitPrice: this.roundMoney(detail.unitPrice),
        subtotal,
        pricingConfigured: true,
        priceNormal: this.roundMoney(
          detail.priceNormal,
        ),
        priceCamino: this.roundMoney(
          detail.priceCamino,
        ),
        priceEspecial: this.roundMoney(
          detail.priceEspecial,
        ),
        priceMayorista: hasWholesalePrice
          ? this.roundMoney(
              detail.priceMayorista!,
            )
          : null,
        minQuantityWholesale:
          hasWholesaleMinimum
            ? detail.minQuantityWholesale!
            : null,
      };

      const existingGroup = groupMap.get(product.providerId);

      if (existingGroup) {
        existingGroup.details.push(preparedDetail);
        existingGroup.total = this.roundMoney(
          existingGroup.total + subtotal,
        );
      } else {
        groupMap.set(product.providerId, {
          providerId: product.providerId,
          total: subtotal,
          details: [preparedDetail],
        });
      }
    }

    return Array.from(groupMap.values());
  }

  private getOverallStatus(
    groups: Array<{
      status: $Enums.PurchaseProviderStatus;
    }>,
  ): $Enums.PurchaseStatus {
    const hasPending = groups.some(
      (group) =>
        group.status === $Enums.PurchaseProviderStatus.PENDING,
    );

    if (hasPending) {
      return $Enums.PurchaseStatus.PENDING;
    }

    const hasReceived = groups.some(
      (group) =>
        group.status === $Enums.PurchaseProviderStatus.RECEIVED,
    );

    if (hasReceived) {
      return $Enums.PurchaseStatus.RECEIVED;
    }

    return $Enums.PurchaseStatus.CANCELLED;
  }

  private async synchronizePurchase(
    prisma: any,
    purchaseId: string,
  ): Promise<$Enums.PurchaseStatus> {
    const groups = await prisma.purchaseProvider.findMany({
      where: {
        purchaseId,
      },
      select: {
        status: true,
        total: true,
      },
    });

    const status = this.getOverallStatus(groups);

    const activeTotal = this.roundMoney(
      groups
        .filter(
          (group: any) =>
            group.status !==
            $Enums.PurchaseProviderStatus.CANCELLED,
        )
        .reduce(
          (sum: number, group: any) => sum + group.total,
          0,
        ),
    );

    await prisma.purchase.update({
      where: {
        id: purchaseId,
      },
      data: {
        status,
        total: activeTotal,
        pdfUrl:
          status === $Enums.PurchaseStatus.CANCELLED
            ? null
            : undefined,
      },
    });

    return status;
  }

  private async generateFinalPdf(
    purchaseId: string,
    status: $Enums.PurchaseStatus,
  ): Promise<void> {
    if (status !== $Enums.PurchaseStatus.RECEIVED) {
      return;
    }

    try {
      const pdfUrl =
        await this.reportsService.generatePurchasePDF(purchaseId);

      await this.prisma.purchase.update({
        where: {
          id: purchaseId,
        },
        data: {
          pdfUrl,
        },
      });
    } catch (error) {
      console.error(
        'Error generando comprobante de compra:',
        error,
      );
    }
  }

  async create(
    createPurchaseDto: CreatePurchaseDto,
    userId: number,
  ): Promise<PurchaseResponseDto> {
    const groups = await this.prepareProviderGroups(
      createPurchaseDto.details,
    );

    const total = this.roundMoney(
      groups.reduce((sum, group) => sum + group.total, 0),
    );

    const purchase = await this.prisma.purchase.create({
      data: {
        userId,
        observations: createPurchaseDto.observations,
        total,
        providerGroups: {
          create: groups.map((group) => ({
            providerId: group.providerId,
            total: group.total,
            details: {
              create: group.details.map((detail) => ({
                productId: detail.productId,
                categoryId: detail.categoryId,
                quantity: detail.quantity,
                unitPrice: detail.unitPrice,
                subtotal: detail.subtotal,
                pricingConfigured:
                  detail.pricingConfigured,
                priceNormal: detail.priceNormal,
                priceCamino: detail.priceCamino,
                priceEspecial:
                  detail.priceEspecial,
                priceMayorista:
                  detail.priceMayorista,
                minQuantityWholesale:
                  detail.minQuantityWholesale,
              })),
            },
          })),
        },
      },
      include: this.purchaseInclude(),
    });

    return this.toResponse(purchase);
  }

  async update(
    id: string,
    updatePurchaseDto: UpdatePurchaseDto,
  ): Promise<PurchaseResponseDto> {
    const currentPurchase =
      await this.prisma.purchase.findUnique({
        where: {
          id,
        },
        include: {
          providerGroups: true,
        },
      });

    if (!currentPurchase) {
      throw new NotFoundException('Compra no encontrada');
    }

    const allGroupsArePending =
      currentPurchase.providerGroups.every(
        (group) =>
          group.status ===
          $Enums.PurchaseProviderStatus.PENDING,
      );

    if (
      currentPurchase.status !==
        $Enums.PurchaseStatus.PENDING ||
      !allGroupsArePending
    ) {
      throw new BadRequestException(
        'La compra solo se puede editar antes de recibir o anular algÃºn proveedor',
      );
    }

    if (!updatePurchaseDto.details) {
      const updated = await this.prisma.purchase.update({
        where: {
          id,
        },
        data: {
          observations:
            updatePurchaseDto.observations !== undefined
              ? updatePurchaseDto.observations
              : currentPurchase.observations,
        },
        include: this.purchaseInclude(),
      });

      return this.toResponse(updated);
    }

    const groups = await this.prepareProviderGroups(
      updatePurchaseDto.details,
    );

    const total = this.roundMoney(
      groups.reduce((sum, group) => sum + group.total, 0),
    );

    const updated = await this.prisma.$transaction(
      async (prisma) => {
        await prisma.purchaseProvider.deleteMany({
          where: {
            purchaseId: id,
          },
        });

        return prisma.purchase.update({
          where: {
            id,
          },
          data: {
            observations:
              updatePurchaseDto.observations !== undefined
                ? updatePurchaseDto.observations
                : currentPurchase.observations,
            total,
            providerGroups: {
              create: groups.map((group) => ({
                providerId: group.providerId,
                total: group.total,
                details: {
                  create: group.details.map((detail) => ({
                    productId: detail.productId,
                    categoryId: detail.categoryId,
                    quantity: detail.quantity,
                    unitPrice: detail.unitPrice,
                    subtotal: detail.subtotal,
                    pricingConfigured:
                      detail.pricingConfigured,
                    priceNormal:
                      detail.priceNormal,
                    priceCamino:
                      detail.priceCamino,
                    priceEspecial:
                      detail.priceEspecial,
                    priceMayorista:
                      detail.priceMayorista,
                    minQuantityWholesale:
                      detail.minQuantityWholesale,
                  })),
                },
              })),
            },
          },
          include: this.purchaseInclude(),
        });
      },
    );

    return this.toResponse(updated);
  }

  async receiveProvider(
    purchaseId: string,
    purchaseProviderId: string,
  ): Promise<PurchaseResponseDto> {
    const status = await this.prisma.$transaction(
      async (prisma) => {
        const group =
          await prisma.purchaseProvider.findFirst({
            where: {
              id: purchaseProviderId,
              purchaseId,
            },
            include: {
              purchase: true,
              details: {
                include: {
                  product: true,
                },
              },
            },
          });

        if (!group) {
          throw new NotFoundException(
            'Proveedor de la compra no encontrado',
          );
        }

        if (
          group.purchase.status ===
          $Enums.PurchaseStatus.CANCELLED
        ) {
          throw new BadRequestException(
            'La compra estÃ¡ anulada',
          );
        }

        if (
          group.status !==
          $Enums.PurchaseProviderStatus.PENDING
        ) {
          throw new BadRequestException(
            'Solo se pueden recibir proveedores pendientes',
          );
        }

        for (const detail of group.details) {
          const product = detail.product;
          const newPurchasePrice = this.roundMoney(
            detail.unitPrice,
          );

          const updateData: any = {
            stock: {
              increment: detail.quantity,
            },
            purchasePrice: newPurchasePrice,
          };

          if (detail.pricingConfigured) {
            if (
              detail.priceNormal === null ||
              detail.priceCamino === null ||
              detail.priceEspecial === null
            ) {
              throw new BadRequestException(
                `La configuraciÃ³n de precios para "${product.name}" estÃ¡ incompleta`,
              );
            }

            updateData.priceNormal =
              this.roundMoney(detail.priceNormal);
            updateData.priceCamino =
              this.roundMoney(detail.priceCamino);
            updateData.priceEspecial =
              this.roundMoney(detail.priceEspecial);
            updateData.priceMayorista =
              detail.priceMayorista === null
                ? null
                : this.roundMoney(
                    detail.priceMayorista,
                  );
            updateData.minQuantityWholesale =
              detail.minQuantityWholesale;
            updateData.markupNormal =
              this.calculateMarkup(
                newPurchasePrice,
                detail.priceNormal,
              );
            updateData.markupCamino =
              this.calculateMarkup(
                newPurchasePrice,
                detail.priceCamino,
              );
            updateData.markupEspecial =
              this.calculateMarkup(
                newPurchasePrice,
                detail.priceEspecial,
              );

            if (detail.priceMayorista !== null) {
              updateData.markupMayorista =
                this.calculateMarkup(
                  newPurchasePrice,
                  detail.priceMayorista,
                );
            }
          } else {
            // Compatibilidad con compras pendientes creadas antes
            // de guardar los precios propuestos en cada detalle.
            updateData.priceNormal = this.roundMoney(
              newPurchasePrice *
                (1 + product.markupNormal / 100),
            );
            updateData.priceCamino = this.roundMoney(
              newPurchasePrice *
                (1 + product.markupCamino / 100),
            );
            updateData.priceEspecial = this.roundMoney(
              newPurchasePrice *
                (1 + product.markupEspecial / 100),
            );

            if (product.priceMayorista !== null) {
              updateData.priceMayorista =
                this.roundMoney(
                  newPurchasePrice *
                    (1 +
                      product.markupMayorista / 100),
                );
            }
          }

          await prisma.product.update({
            where: {
              id: product.id,
            },
            data: updateData,
          });
        }

        await prisma.purchaseProvider.update({
          where: {
            id: group.id,
          },
          data: {
            status:
              $Enums.PurchaseProviderStatus.RECEIVED,
            receivedAt: new Date(),
            cancelledAt: null,
          },
        });

        return this.synchronizePurchase(
          prisma,
          purchaseId,
        );
      },
    );

    await this.generateFinalPdf(purchaseId, status);

    return this.findOne(purchaseId);
  }

  async cancelProvider(
    purchaseId: string,
    purchaseProviderId: string,
  ): Promise<PurchaseResponseDto> {
    const status = await this.prisma.$transaction(
      async (prisma) => {
        const group =
          await prisma.purchaseProvider.findFirst({
            where: {
              id: purchaseProviderId,
              purchaseId,
            },
            include: {
              details: {
                include: {
                  product: true,
                },
              },
            },
          });

        if (!group) {
          throw new NotFoundException(
            'Proveedor de la compra no encontrado',
          );
        }

        if (
          group.status ===
          $Enums.PurchaseProviderStatus.CANCELLED
        ) {
          throw new BadRequestException(
            'El proveedor ya estÃ¡ anulado',
          );
        }

        if (
          group.status ===
          $Enums.PurchaseProviderStatus.RECEIVED
        ) {
          for (const detail of group.details) {
            const newStock =
              detail.product.stock - detail.quantity;

            if (newStock < 0) {
              throw new BadRequestException(
                `No se puede anular "${detail.product.name}" porque el stock quedarÃ­a negativo`,
              );
            }
          }

          for (const detail of group.details) {
            await prisma.product.update({
              where: {
                id: detail.productId,
              },
              data: {
                stock: {
                  decrement: detail.quantity,
                },
              },
            });
          }
        }

        await prisma.purchaseProvider.update({
          where: {
            id: group.id,
          },
          data: {
            status:
              $Enums.PurchaseProviderStatus.CANCELLED,
            cancelledAt: new Date(),
          },
        });

        return this.synchronizePurchase(
          prisma,
          purchaseId,
        );
      },
    );

    // Si quedan proveedores recibidos y ninguno pendiente,
    // se vuelve a generar el PDF excluyendo el proveedor anulado.
    await this.generateFinalPdf(purchaseId, status);

    return this.findOne(purchaseId);
  }

  async cancel(
    id: string,
  ): Promise<PurchaseResponseDto> {
    await this.prisma.$transaction(async (prisma) => {
      const purchase = await prisma.purchase.findUnique({
        where: {
          id,
        },
        include: {
          providerGroups: {
            include: {
              details: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      });

      if (!purchase) {
        throw new NotFoundException(
          'Compra no encontrada',
        );
      }

      if (
        purchase.status ===
        $Enums.PurchaseStatus.CANCELLED
      ) {
        throw new BadRequestException(
          'La compra ya estÃ¡ anulada',
        );
      }

      const receivedDetails =
        purchase.providerGroups
          .filter(
            (group) =>
              group.status ===
              $Enums.PurchaseProviderStatus.RECEIVED,
          )
          .flatMap((group) => group.details);

      for (const detail of receivedDetails) {
        if (
          detail.product.stock - detail.quantity <
          0
        ) {
          throw new BadRequestException(
            `No se puede anular la compra porque "${detail.product.name}" quedarÃ­a con stock negativo`,
          );
        }
      }

      for (const detail of receivedDetails) {
        await prisma.product.update({
          where: {
            id: detail.productId,
          },
          data: {
            stock: {
              decrement: detail.quantity,
            },
          },
        });
      }

      await prisma.purchaseProvider.updateMany({
        where: {
          purchaseId: id,
        },
        data: {
          status:
            $Enums.PurchaseProviderStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      await prisma.purchase.update({
        where: {
          id,
        },
        data: {
          status: $Enums.PurchaseStatus.CANCELLED,
          total: 0,
          pdfUrl: null,
        },
      });
    });

    return this.findOne(id);
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
      where.providerGroups = {
        some: {
          providerId: filters.providerId,
        },
      };
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

    const purchases =
      await this.prisma.purchase.findMany({
        where,
        include: this.purchaseInclude(),
        orderBy: {
          date: 'desc',
        },
      });

    return purchases.map((purchase) =>
      this.toResponse(purchase),
    );
  }

  async findOne(
    id: string,
  ): Promise<PurchaseResponseDto> {
    const purchase =
      await this.prisma.purchase.findUnique({
        where: {
          id,
        },
        include: this.purchaseInclude(),
      });

    if (!purchase) {
      throw new NotFoundException(
        'Compra no encontrada',
      );
    }

    return this.toResponse(purchase);
  }
}