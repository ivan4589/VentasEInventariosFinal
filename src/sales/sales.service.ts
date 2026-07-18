import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { SaleResponseDto } from './dto/sale-response.dto';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  private async generateSaleNumber(): Promise<string> {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const prefix = `${day}-${month}`;

    const lastSale = await this.prisma.sale.findFirst({
      where: {
        saleNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        saleNumber: 'desc',
      },
    });

    let nextNumber = 1;

    if (lastSale) {
      const parts = lastSale.saleNumber.split('-');
      const lastNumber = Number(parts[2]);

      if (!Number.isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    return `${prefix}-${String(nextNumber).padStart(3, '0')}`;
  }

  private toResponse(sale: any): SaleResponseDto {
    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      clientId: sale.clientId,
      clientName: sale.client?.fullName || '',
      userId: sale.userId,
      userName: sale.user?.name || '',
      date: sale.date,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      total: sale.total,
      discount: sale.discount,
      observations: sale.observations,
      pdfUrl: sale.pdfUrl,
      details:
        sale.details?.map((detail) => ({
          id: detail.id,
          productId: detail.productId,
          productName: detail.product?.name || '',
          quantity: detail.quantity,
          unitPrice: detail.unitPrice,
          subtotal: detail.subtotal,
        })) || [],
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }

  async create(
    createSaleDto: CreateSaleDto,
    userId: number,
  ): Promise<SaleResponseDto> {
    const {
      clientId,
      details,
      discount = 0,
      observations,
      paymentStatus,
    } = createSaleDto;

    if (!details || details.length === 0) {
      throw new BadRequestException('La venta debe tener al menos un detalle');
    }

    const client = await this.prisma.client.findUnique({
      where: {
        id: clientId,
      },
    });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
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

    if (discount < 0) {
      throw new BadRequestException('El descuento no puede ser negativo');
    }

    const subtotal = details.reduce(
      (sum, detail) => sum + detail.quantity * detail.unitPrice,
      0,
    );

    const total = subtotal - discount;

    if (total < 0) {
      throw new BadRequestException('El total no puede ser negativo');
    }

    const saleNumber = await this.generateSaleNumber();

    const sale = await this.prisma.sale.create({
      data: {
        saleNumber,
        clientId,
        userId,
        status: $Enums.SaleStatus.PENDING,
        paymentStatus,
        subtotal,
        total,
        discount,
        observations,
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
        client: true,
        user: true,
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    if (paymentStatus === $Enums.PaymentStatus.PAID) {
      return this.confirm(sale.id, userId);
    }

    return this.toResponse(sale);
  }

  async confirm(id: string, userId: number): Promise<SaleResponseDto> {
    const updated = await this.prisma.$transaction(async (prisma) => {
      const sale = await prisma.sale.findUnique({
        where: {
          id,
        },
        include: {
          client: true,
          user: true,
          details: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!sale) {
        throw new NotFoundException('Venta no encontrada');
      }

      if (sale.status !== $Enums.SaleStatus.PENDING) {
        throw new BadRequestException(
          'Solo se pueden confirmar ventas en estado PENDING',
        );
      }

      const lowStockAlerts: {
        productId: string;
        productName: string;
        currentStock: number;
        minStock: number;
      }[] = [];

      for (const detail of sale.details) {
        const product = detail.product;

        if (product.stock < detail.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para el producto ${product.name}. Disponible: ${product.stock}, solicitado: ${detail.quantity}`,
          );
        }

        const newStock = product.stock - detail.quantity;

        await prisma.product.update({
          where: {
            id: detail.productId,
          },
          data: {
            stock: newStock,
          },
        });

        if (newStock < product.minStock) {
          lowStockAlerts.push({
            productId: product.id,
            productName: product.name,
            currentStock: newStock,
            minStock: product.minStock,
          });
        }
      }

      const confirmed = await prisma.sale.update({
        where: {
          id,
        },
        data: {
          status: $Enums.SaleStatus.CONFIRMED,
        },
        include: {
          client: true,
          user: true,
          details: {
            include: {
              product: true,
            },
          },
        },
      });

      return {
        confirmed,
        lowStockAlerts,
      };
    });

    let pdfUrl: string | null = null;

    try {
      pdfUrl = await this.reportsService.generateSalePDF(updated.confirmed.id);
    } catch (error) {
      console.error('Error generando PDF de venta:', error);
    }

    if (pdfUrl) {
      const confirmedWithPdf = await this.prisma.sale.update({
        where: {
          id,
        },
        data: {
          pdfUrl,
        },
        include: {
          client: true,
          user: true,
          details: {
            include: {
              product: true,
            },
          },
        },
      });

      return {
        ...this.toResponse(confirmedWithPdf),
        lowStockAlerts: updated.lowStockAlerts,
      };
    }

    return {
      ...this.toResponse(updated.confirmed),
      lowStockAlerts: updated.lowStockAlerts,
    };
  }

  async update(
    id: string,
    updateSaleDto: UpdateSaleDto,
  ): Promise<SaleResponseDto> {
    const sale = await this.prisma.sale.findUnique({
      where: {
        id,
      },
      include: {
        details: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    if (sale.status !== $Enums.SaleStatus.PENDING) {
      throw new BadRequestException(
        'Solo se pueden editar ventas en estado PENDING',
      );
    }

    const { details, discount, observations } = updateSaleDto;

    let total = sale.total;
    let subtotal = sale.subtotal;
    const finalDiscount = discount !== undefined ? discount : sale.discount;

    if (finalDiscount < 0) {
      throw new BadRequestException('El descuento no puede ser negativo');
    }

    if (details) {
      if (details.length === 0) {
        throw new BadRequestException('La venta debe tener al menos un detalle');
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

      await this.prisma.saleDetail.deleteMany({
        where: {
          saleId: id,
        },
      });

      const newDetails = details.map((detail) => ({
        productId: detail.productId,
        quantity: detail.quantity,
        unitPrice: detail.unitPrice,
        subtotal: detail.quantity * detail.unitPrice,
      }));

      subtotal = newDetails.reduce(
        (sum, detail) => sum + detail.subtotal,
        0,
      );

      total = subtotal - finalDiscount;

      if (total < 0) {
        throw new BadRequestException('El total no puede ser negativo');
      }

      await this.prisma.saleDetail.createMany({
        data: newDetails.map((detail) => ({
          ...detail,
          saleId: id,
        })),
      });
    } else if (discount !== undefined) {
      const currentSubtotal = await this.prisma.saleDetail.aggregate({
        where: {
          saleId: id,
        },
        _sum: {
          subtotal: true,
        },
      });

      total = (currentSubtotal._sum.subtotal || 0) - finalDiscount;
      subtotal = currentSubtotal._sum.subtotal || 0;

      if (total < 0) {
        throw new BadRequestException('El total no puede ser negativo');
      }
    }

    const updated = await this.prisma.sale.update({
      where: {
        id,
      },
      data: {
        discount: finalDiscount,
        observations:
          observations !== undefined ? observations : sale.observations,
        subtotal,
        total,
      },
      include: {
        client: true,
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

  async cancel(id: string): Promise<SaleResponseDto> {
    const cancelled = await this.prisma.$transaction(async (prisma) => {
      const sale = await prisma.sale.findUnique({
        where: {
          id,
        },
        include: {
          client: true,
          user: true,
          details: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!sale) {
        throw new NotFoundException('Venta no encontrada');
      }

      if (sale.status === $Enums.SaleStatus.CANCELLED) {
        throw new BadRequestException('La venta ya está anulada');
      }

      if (sale.status === $Enums.SaleStatus.CONFIRMED) {
        for (const detail of sale.details) {
          const product = detail.product;
          const newStock = product.stock + detail.quantity;

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

      return prisma.sale.update({
        where: {
          id,
        },
        data: {
          status: $Enums.SaleStatus.CANCELLED,
        },
        include: {
          client: true,
          user: true,
          details: {
            include: {
              product: true,
            },
          },
        },
      });
    });

    return this.toResponse(cancelled);
  }

  async findAll(filters?: {
    status?: $Enums.SaleStatus;
    paymentStatus?: $Enums.PaymentStatus;
    clientId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<SaleResponseDto[]> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.paymentStatus) {
      where.paymentStatus = filters.paymentStatus;
    }

    if (filters?.clientId) {
      where.clientId = filters.clientId;
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

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        client: true,
        user: true,
        details: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    return sales.map((sale) => this.toResponse(sale));
  }

  async findOne(id: string): Promise<SaleResponseDto> {
    const sale = await this.prisma.sale.findUnique({
      where: {
        id,
      },
      include: {
        client: true,
        user: true,
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    return this.toResponse(sale);
  }

  async getLowStockProducts() {
    const products = await this.prisma.product.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    return products.filter((product) => product.stock < product.minStock);
  }
}
