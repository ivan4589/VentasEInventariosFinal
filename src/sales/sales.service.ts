import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { SaleResponseDto } from './dto/sale-response.dto';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private saleInclude(): any {
    return {
      client: {
        include: {
          location: true,
        },
      },
      user: true,
      details: {
        include: {
          product: true,
        },
      },
      payments: true,
    };
  }

  private async generateSaleNumber(): Promise<string> {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const dailyPrefix = `${year}${month}${day}`;
    const monthlyPrefix = `${year}${month}`;

    const lastSale = await this.prisma.sale.findFirst({
      where: {
        saleNumber: {
          startsWith: monthlyPrefix,
        },
      },
      orderBy: {
        saleNumber: 'desc',
      },
      select: {
        saleNumber: true,
      },
    });

    let nextNumber = 1;

    if (lastSale) {
      const parts = lastSale.saleNumber.split('-');
      const currentNumber = Number(parts[1]);

      if (!Number.isNaN(currentNumber)) {
        nextNumber = currentNumber + 1;
      }
    }

    return `${dailyPrefix}-${String(nextNumber).padStart(3, '0')}`;
  }

  private calculatePaymentStatus(
    total: number,
    paidAmount: number,
  ): $Enums.PaymentStatus {
    if (paidAmount <= 0) {
      return $Enums.PaymentStatus.PENDING;
    }

    if (paidAmount >= total) {
      return $Enums.PaymentStatus.PAID;
    }

    return $Enums.PaymentStatus.PARTIALLY_PAID;
  }

  private getDefaultProductPrice(
    product: any,
    clientType: $Enums.ClientType,
    quantity: number,
  ): number {
    if (
      clientType === $Enums.ClientType.NORMAL &&
      product.priceMayorista !== null &&
      product.minQuantityWholesale !== null &&
      quantity >= product.minQuantityWholesale
    ) {
      return product.priceMayorista;
    }

    if (clientType === $Enums.ClientType.CAMINO) {
      return product.priceCamino;
    }

    if (clientType === $Enums.ClientType.ESPECIAL) {
      return product.priceEspecial;
    }

    return product.priceNormal;
  }

  private validateDueDate(
    saleType: $Enums.SaleType,
    dueDate?: string | Date | null,
  ): Date | null {
    if (saleType === $Enums.SaleType.CASH) {
      return null;
    }

    if (!dueDate) {
      throw new BadRequestException(
        'Las ventas a crédito deben tener fecha de vencimiento',
      );
    }

    const parsedDueDate = new Date(dueDate);

    if (Number.isNaN(parsedDueDate.getTime())) {
      throw new BadRequestException(
        'La fecha de vencimiento no es válida',
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const maximumDate = new Date(today);
    maximumDate.setDate(maximumDate.getDate() + 7);
    maximumDate.setHours(23, 59, 59, 999);

    if (parsedDueDate < today) {
      throw new BadRequestException(
        'La fecha de vencimiento no puede ser anterior a hoy',
      );
    }

    if (parsedDueDate > maximumDate) {
      throw new BadRequestException(
        'El crédito no puede superar los siete días',
      );
    }

    return parsedDueDate;
  }

  private async getPaidAmount(
    saleId: string,
    prisma: any = this.prisma,
  ): Promise<number> {
    const payments = await prisma.payment.aggregate({
      where: {
        saleId,
      },
      _sum: {
        amount: true,
      },
    });

    return this.roundMoney(
      payments._sum.amount || 0,
    );
  }

  private async toResponse(
    sale: any,
  ): Promise<SaleResponseDto> {
    const paidAmount = Array.isArray(sale.payments)
      ? this.roundMoney(
          sale.payments.reduce(
            (sum: number, payment: any) =>
              sum + payment.amount,
            0,
          ),
        )
      : await this.getPaidAmount(sale.id);

    return {
      id: sale.id,
      saleNumber: sale.saleNumber,

      clientId: sale.clientId,
      clientName: sale.client?.fullName || '',
      clientAlias: sale.client?.alias,
      clientType: sale.client?.type,
      clientLocation:
        sale.client?.location?.name || '',
      clientPhone: sale.client?.phone,

      userId: sale.userId,
      userName: sale.user?.name || '',

      date: sale.date,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      saleType: sale.saleType,
      dueDate: sale.dueDate,

      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      paidAmount,
      balance: this.roundMoney(
        Math.max(sale.total - paidAmount, 0),
      ),

      observations: sale.observations,
      pdfUrl: sale.pdfUrl,
      cancelledPdfUrl: sale.cancelledPdfUrl,

      details:
        sale.details?.map((detail: any) => ({
          id: detail.id,
          productId: detail.productId,
          productName:
            detail.product?.name || '',
          productImageUrl:
            detail.product?.imageUrl,
          presentation:
            detail.product?.weight ||
            detail.product?.unit,
          quantity: detail.quantity,
          returnedQuantity:
            detail.returnedQuantity,
          unitPrice: detail.unitPrice,
          subtotal: detail.subtotal,
        })) || [],

      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }

  private async validateAndPrepareDetails(
    clientId: string,
    details: CreateSaleDto['details'],
    currentSaleId?: string,
  ) {
    if (!details?.length) {
      throw new BadRequestException(
        'La venta debe tener al menos un producto',
      );
    }

    const productIds = details.map(
      (detail) => detail.productId,
    );

    const duplicatedProduct = productIds.find(
      (id, index) =>
        productIds.indexOf(id) !== index,
    );

    if (duplicatedProduct) {
      throw new BadRequestException(
        'No se puede repetir el mismo producto en la venta',
      );
    }

    const [client, products] = await Promise.all([
      this.prisma.client.findUnique({
        where: {
          id: clientId,
        },
      }),
      this.prisma.product.findMany({
        where: {
          id: {
            in: productIds,
          },
        },
      }),
    ]);

    if (!client) {
      throw new NotFoundException(
        'Cliente no encontrado',
      );
    }

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'Uno o más productos no existen',
      );
    }

    const productMap = new Map(
      products.map((product) => [
        product.id,
        product,
      ]),
    );

    let previousReservations = new Map<
      string,
      number
    >();

    if (currentSaleId) {
      const oldDetails =
        await this.prisma.saleDetail.findMany({
          where: {
            saleId: currentSaleId,
          },
        });

      previousReservations = new Map(
        oldDetails.map((detail) => [
          detail.productId,
          detail.quantity,
        ]),
      );
    }

    const preparedDetails = details.map(
      (detail) => {
        const product = productMap.get(
          detail.productId,
        );

        if (!product) {
          throw new NotFoundException(
            `Producto ${detail.productId} no encontrado`,
          );
        }

        const oldReserved =
          previousReservations.get(product.id) || 0;

        const availableStock =
          product.stock -
          product.reservedStock +
          oldReserved;

        if (detail.quantity > availableStock) {
          throw new BadRequestException(
            `Stock insuficiente para "${product.name}". Disponible: ${availableStock}, solicitado: ${detail.quantity}`,
          );
        }

        const automaticPrice =
          this.getDefaultProductPrice(
            product,
            client.type,
            detail.quantity,
          );

        const unitPrice =
          detail.unitPrice > 0
            ? detail.unitPrice
            : automaticPrice;

        return {
          productId: product.id,
          productName: product.name,
          quantity: detail.quantity,
          unitPrice: this.roundMoney(unitPrice),
          subtotal: this.roundMoney(
            detail.quantity * unitPrice,
          ),
          previousReserved: oldReserved,
        };
      },
    );

    return {
      client,
      preparedDetails,
    };
  }

  async create(
    createSaleDto: CreateSaleDto,
    userId: number,
    userRole: $Enums.Role,
  ): Promise<SaleResponseDto> {
    const {
      clientId,
      details,
      observations,
      saleType,
      dueDate,
      initialPayment = 0,
      paymentMethod,
      paymentReference,
    } = createSaleDto;

    const discount =
      userRole === $Enums.Role.ADMIN
        ? createSaleDto.discount || 0
        : 0;

    if (
      userRole !== $Enums.Role.ADMIN &&
      (createSaleDto.discount || 0) > 0
    ) {
      throw new BadRequestException(
        'Solo el administrador puede aplicar descuentos',
      );
    }

    const parsedDueDate =
      this.validateDueDate(saleType, dueDate);

    const { preparedDetails } =
      await this.validateAndPrepareDetails(
        clientId,
        details,
      );

    const subtotal = this.roundMoney(
      preparedDetails.reduce(
        (sum, detail) =>
          sum + detail.subtotal,
        0,
      ),
    );

    const total = this.roundMoney(
      subtotal - discount,
    );

    if (total < 0) {
      throw new BadRequestException(
        'El descuento no puede superar el subtotal',
      );
    }

    if (initialPayment > total) {
      throw new BadRequestException(
        'El pago inicial no puede superar el total de la venta',
      );
    }

    if (
      initialPayment > 0 &&
      !paymentMethod
    ) {
      throw new BadRequestException(
        'Debes seleccionar un método para el pago inicial',
      );
    }

    const paymentStatus =
      this.calculatePaymentStatus(
        total,
        initialPayment,
      );

    const saleNumber =
      await this.generateSaleNumber();

    const sale = await this.prisma.$transaction(
      async (prisma) => {
        for (const detail of preparedDetails) {
          await prisma.product.update({
            where: {
              id: detail.productId,
            },
            data: {
              reservedStock: {
                increment: detail.quantity,
              },
            },
          });
        }

        const createdSale =
          await prisma.sale.create({
            data: {
              saleNumber,
              clientId,
              userId,
              saleType,
              dueDate: parsedDueDate,
              status:
                $Enums.SaleStatus.PENDING,
              paymentStatus,
              subtotal,
              discount,
              total,
              observations,
              details: {
                create: preparedDetails.map(
                  (detail) => ({
                    productId:
                      detail.productId,
                    quantity:
                      detail.quantity,
                    unitPrice:
                      detail.unitPrice,
                    subtotal:
                      detail.subtotal,
                  }),
                ),
              },
            },
          });

        if (initialPayment > 0) {
          await prisma.payment.create({
            data: {
              saleId: createdSale.id,
              clientId,
              userId,
              amount: initialPayment,
              method: paymentMethod!,
              reference:
                paymentReference || null,
              observations:
                'Pago inicial registrado con la venta',
            },
          });
        }

        return createdSale;
      },
    );

    if (
      paymentStatus ===
      $Enums.PaymentStatus.PAID
    ) {
      return this.confirm(sale.id, userId);
    }

    return this.findOne(sale.id);
  }

  async confirm(
    id: string,
    userId: number,
  ): Promise<SaleResponseDto> {
    await this.prisma.$transaction(
      async (prisma) => {
        const sale =
          await prisma.sale.findUnique({
            where: {
              id,
            },
            include: {
              details: {
                include: {
                  product: true,
                },
              },
            },
          });

        if (!sale) {
          throw new NotFoundException(
            'Venta no encontrada',
          );
        }

        if (
          sale.status !==
          $Enums.SaleStatus.PENDING
        ) {
          throw new BadRequestException(
            'Solo se pueden confirmar ventas pendientes',
          );
        }

        for (const detail of sale.details) {
          if (
            detail.product.stock <
            detail.quantity
          ) {
            throw new BadRequestException(
              `Stock insuficiente para "${detail.product.name}"`,
            );
          }

          if (
            detail.product.reservedStock <
            detail.quantity
          ) {
            throw new BadRequestException(
              `La reserva de "${detail.product.name}" es inconsistente`,
            );
          }

          await prisma.product.update({
            where: {
              id: detail.productId,
            },
            data: {
              stock: {
                decrement: detail.quantity,
              },
              reservedStock: {
                decrement: detail.quantity,
              },
            },
          });
        }

        await prisma.sale.update({
          where: {
            id,
          },
          data: {
            status:
              $Enums.SaleStatus.CONFIRMED,
          },
        });
      },
    );

    let pdfUrl: string | null = null;

    try {
      pdfUrl =
        await this.reportsService.generateSalePDF(
          id,
        );
    } catch (error) {
      console.error(
        'Error generando recibo de venta:',
        error,
      );
    }

    if (pdfUrl) {
      await this.prisma.sale.update({
        where: {
          id,
        },
        data: {
          pdfUrl,
        },
      });
    }

    return this.findOne(id);
  }

  async update(
    id: string,
    updateSaleDto: UpdateSaleDto,
    userRole: $Enums.Role,
  ): Promise<SaleResponseDto> {
    const current =
      await this.prisma.sale.findUnique({
        where: {
          id,
        },
        include: {
          details: true,
        },
      });

    if (!current) {
      throw new NotFoundException(
        'Venta no encontrada',
      );
    }

    if (
      current.status !==
      $Enums.SaleStatus.PENDING
    ) {
      throw new BadRequestException(
        'Solo se pueden modificar ventas pendientes',
      );
    }

    if (
      userRole !== $Enums.Role.ADMIN &&
      updateSaleDto.discount !== undefined &&
      updateSaleDto.discount !==
        current.discount
    ) {
      throw new BadRequestException(
        'Solo el administrador puede modificar el descuento',
      );
    }

    const finalClientId =
      updateSaleDto.clientId ||
      current.clientId;

    const finalSaleType =
      updateSaleDto.saleType ||
      current.saleType;

    const finalDueDate =
      updateSaleDto.dueDate !== undefined
        ? this.validateDueDate(
            finalSaleType,
            updateSaleDto.dueDate,
          )
        : current.dueDate;

    const finalDiscount =
      userRole === $Enums.Role.ADMIN &&
      updateSaleDto.discount !== undefined
        ? updateSaleDto.discount
        : current.discount;

    let newSubtotal = current.subtotal;

    await this.prisma.$transaction(
      async (prisma) => {
        if (updateSaleDto.details) {
          const { preparedDetails } =
            await this.validateAndPrepareDetails(
              finalClientId,
              updateSaleDto.details,
              id,
            );

          for (const oldDetail of current.details) {
            await prisma.product.update({
              where: {
                id: oldDetail.productId,
              },
              data: {
                reservedStock: {
                  decrement:
                    oldDetail.quantity,
                },
              },
            });
          }

          await prisma.saleDetail.deleteMany({
            where: {
              saleId: id,
            },
          });

          for (const newDetail of preparedDetails) {
            await prisma.product.update({
              where: {
                id: newDetail.productId,
              },
              data: {
                reservedStock: {
                  increment:
                    newDetail.quantity,
                },
              },
            });
          }

          await prisma.saleDetail.createMany({
            data: preparedDetails.map(
              (detail) => ({
                saleId: id,
                productId: detail.productId,
                quantity: detail.quantity,
                unitPrice: detail.unitPrice,
                subtotal: detail.subtotal,
              }),
            ),
          });

          newSubtotal = this.roundMoney(
            preparedDetails.reduce(
              (sum, detail) =>
                sum + detail.subtotal,
              0,
            ),
          );
        }

        const total = this.roundMoney(
          newSubtotal - finalDiscount,
        );

        if (total < 0) {
          throw new BadRequestException(
            'El descuento no puede superar el subtotal',
          );
        }

        const paidAmount =
          await this.getPaidAmount(id, prisma);

        const paymentStatus =
          this.calculatePaymentStatus(
            total,
            paidAmount,
          );

        await prisma.sale.update({
          where: {
            id,
          },
          data: {
            clientId: finalClientId,
            saleType: finalSaleType,
            dueDate: finalDueDate,
            observations:
              updateSaleDto.observations !==
              undefined
                ? updateSaleDto.observations
                : current.observations,
            subtotal: newSubtotal,
            discount: finalDiscount,
            total,
            paymentStatus,
          },
        });
      },
    );

    const updated = await this.findOne(id);

    if (
      updated.paymentStatus ===
      $Enums.PaymentStatus.PAID
    ) {
      return this.confirm(id, updated.userId);
    }

    return updated;
  }

  async cancel(
    id: string,
  ): Promise<SaleResponseDto> {
    const sale =
      await this.prisma.sale.findUnique({
        where: {
          id,
        },
        include: {
          details: {
            include: {
              product: true,
            },
          },
        },
      });

    if (!sale) {
      throw new NotFoundException(
        'Venta no encontrada',
      );
    }

    if (
      sale.status ===
      $Enums.SaleStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'La venta ya está anulada',
      );
    }

    await this.prisma.$transaction(
      async (prisma) => {
        for (const detail of sale.details) {
          if (
            sale.status ===
            $Enums.SaleStatus.PENDING
          ) {
            await prisma.product.update({
              where: {
                id: detail.productId,
              },
              data: {
                reservedStock: {
                  decrement:
                    detail.quantity,
                },
              },
            });
          }

          if (
            sale.status ===
            $Enums.SaleStatus.CONFIRMED
          ) {
            await prisma.product.update({
              where: {
                id: detail.productId,
              },
              data: {
                stock: {
                  increment:
                    detail.quantity -
                    detail.returnedQuantity,
                },
              },
            });
          }
        }

        await prisma.sale.update({
          where: {
            id,
          },
          data: {
            status:
              $Enums.SaleStatus.CANCELLED,
          },
        });
      },
    );

    let cancelledPdfUrl: string | null = null;

    try {
      cancelledPdfUrl =
        await this.reportsService.generateSalePDF(
          id,
          true,
        );
    } catch (error) {
      console.error(
        'Error generando recibo anulado:',
        error,
      );
    }

    if (cancelledPdfUrl) {
      await this.prisma.sale.update({
        where: {
          id,
        },
        data: {
          cancelledPdfUrl,
        },
      });
    }

    return this.findOne(id);
  }

  async createReturn(
    saleId: string,
    dto: CreateSaleReturnDto,
    userId: number,
  ) {
    const sale =
      await this.prisma.sale.findUnique({
        where: {
          id: saleId,
        },
        include: {
          details: {
            include: {
              product: true,
            },
          },
        },
      });

    if (!sale) {
      throw new NotFoundException(
        'Venta no encontrada',
      );
    }

    if (
      sale.status !==
      $Enums.SaleStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        'Solo se aceptan devoluciones de ventas confirmadas',
      );
    }

    const detailMap = new Map(
      sale.details.map((detail) => [
        detail.id,
        detail,
      ]),
    );

    let returnTotal = 0;

    const prepared = dto.details.map(
      (returnDetail) => {
        const saleDetail = detailMap.get(
          returnDetail.saleDetailId,
        );

        if (!saleDetail) {
          throw new NotFoundException(
            'Detalle de venta no encontrado',
          );
        }

        const availableToReturn =
          saleDetail.quantity -
          saleDetail.returnedQuantity;

        if (
          returnDetail.quantity >
          availableToReturn
        ) {
          throw new BadRequestException(
            `Solo puedes devolver ${availableToReturn} unidades de "${saleDetail.product.name}"`,
          );
        }

        const subtotal = this.roundMoney(
          returnDetail.quantity *
            saleDetail.unitPrice,
        );

        returnTotal += subtotal;

        return {
          saleDetail,
          quantity:
            returnDetail.quantity,
          subtotal,
        };
      },
    );

    const result =
      await this.prisma.$transaction(
        async (prisma) => {
          const saleReturn =
            await prisma.saleReturn.create({
              data: {
                saleId,
                userId,
                amount:
                  this.roundMoney(returnTotal),
                observations:
                  dto.observations,
              },
            });

          for (const item of prepared) {
            await prisma.saleReturnDetail.create({
              data: {
                saleReturnId:
                  saleReturn.id,
                saleDetailId:
                  item.saleDetail.id,
                productId:
                  item.saleDetail.productId,
                quantity: item.quantity,
                unitPrice:
                  item.saleDetail.unitPrice,
                subtotal: item.subtotal,
              },
            });

            await prisma.saleDetail.update({
              where: {
                id: item.saleDetail.id,
              },
              data: {
                returnedQuantity: {
                  increment: item.quantity,
                },
              },
            });

            await prisma.product.update({
              where: {
                id:
                  item.saleDetail.productId,
              },
              data: {
                stock: {
                  increment: item.quantity,
                },
              },
            });
          }

          const newSubtotal =
            this.roundMoney(
              sale.subtotal -
                returnTotal,
            );

          const newTotal = this.roundMoney(
            Math.max(
              newSubtotal -
                sale.discount,
              0,
            ),
          );

          const paidAmount =
            await this.getPaidAmount(
              saleId,
              prisma,
            );

          await prisma.sale.update({
            where: {
              id: saleId,
            },
            data: {
              subtotal: newSubtotal,
              total: newTotal,
              paymentStatus:
                this.calculatePaymentStatus(
                  newTotal,
                  paidAmount,
                ),
            },
          });

          return saleReturn;
        },
      );

    return {
      message:
        'Devolución registrada correctamente',
      return: result,
      sale: await this.findOne(saleId),
    };
  }

  async findAll(filters?: {
    status?: $Enums.SaleStatus;
    paymentStatus?: $Enums.PaymentStatus;
    clientId?: string;
    userId?: number;
    withDebt?: boolean;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<SaleResponseDto[]> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.paymentStatus) {
      where.paymentStatus =
        filters.paymentStatus;
    }

    if (filters?.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.withDebt) {
      where.paymentStatus = {
        in: [
          $Enums.PaymentStatus.PENDING,
          $Enums.PaymentStatus.PARTIALLY_PAID,
        ],
      };

      where.status = {
        not: $Enums.SaleStatus.CANCELLED,
      };
    }

    if (
      filters?.dateFrom ||
      filters?.dateTo
    ) {
      where.date = {};

      if (filters.dateFrom) {
        where.date.gte =
          filters.dateFrom;
      }

      if (filters.dateTo) {
        where.date.lte =
          filters.dateTo;
      }
    }

    const sales =
      await this.prisma.sale.findMany({
        where,
        include: this.saleInclude(),
        orderBy: {
          date: 'desc',
        },
      });

    return Promise.all(
      sales.map((sale) =>
        this.toResponse(sale),
      ),
    );
  }

  async findOne(
    id: string,
  ): Promise<SaleResponseDto> {
    const sale =
      await this.prisma.sale.findUnique({
        where: {
          id,
        },
        include: this.saleInclude(),
      });

    if (!sale) {
      throw new NotFoundException(
        'Venta no encontrada',
      );
    }

    return this.toResponse(sale);
  }

  async getLowStockProducts() {
    const products =
      await this.prisma.product.findMany({
        orderBy: {
          name: 'asc',
        },
      });

    return products
      .map((product) => ({
        ...product,
        availableStock:
          product.stock -
          product.reservedStock,
      }))
      .filter(
        (product) =>
          product.availableStock <=
          product.minStock,
      );
  }
}