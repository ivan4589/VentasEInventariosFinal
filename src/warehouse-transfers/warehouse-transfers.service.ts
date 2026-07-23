import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseTransferDto } from './dto/create-warehouse-transfer.dto';

const STOCK_EPSILON = 0.000001;

@Injectable()
export class WarehouseTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  private transferInclude() {
    return {
      originWarehouse: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      destinationWarehouse: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      details: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              unit: true,
            },
          },
        },
        orderBy: {
          product: {
            name: 'asc' as const,
          },
        },
      },
    };
  }

  private roundQuantity(value: number) {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }

  private generateTransferNumber() {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');

    return `TR-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  async findAll() {
    return this.prisma.warehouseTransfer.findMany({
      include: this.transferInclude(),
      orderBy: {
        transferredAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const transfer = await this.prisma.warehouseTransfer.findUnique({
      where: { id },
      include: this.transferInclude(),
    });

    if (!transfer) {
      throw new NotFoundException(`Transferencia con ID ${id} no encontrada`);
    }

    return transfer;
  }

  async create(dto: CreateWarehouseTransferDto, userId: number) {
    if (dto.originWarehouseId === dto.destinationWarehouseId) {
      throw new BadRequestException(
        'El almacén de origen y el de destino deben ser diferentes',
      );
    }

    const productIds = dto.details.map((detail) => detail.productId);

    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'No puedes repetir un producto en la misma transferencia',
      );
    }

    const details = dto.details.map((detail) => ({
      productId: detail.productId,
      quantity: this.roundQuantity(detail.quantity),
    }));

    const warehouses = await this.prisma.warehouse.findMany({
      where: {
        id: {
          in: [dto.originWarehouseId, dto.destinationWarehouseId],
        },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const originWarehouse = warehouses.find(
      (warehouse) => warehouse.id === dto.originWarehouseId,
    );
    const destinationWarehouse = warehouses.find(
      (warehouse) => warehouse.id === dto.destinationWarehouseId,
    );

    if (!originWarehouse || !destinationWarehouse) {
      throw new BadRequestException(
        'El almacén de origen y el de destino deben existir y estar activos',
      );
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('Uno o más productos no existen');
    }

    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const transferNumber = this.generateTransferNumber();

    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.warehouseTransfer.create({
        data: {
          transferNumber,
          originWarehouseId: originWarehouse.id,
          destinationWarehouseId: destinationWarehouse.id,
          userId,
          observations: dto.observations?.trim() || null,
          details: {
            create: details,
          },
        },
        select: {
          id: true,
        },
      });

      for (const detail of details) {
        const product = productsById.get(detail.productId);

        await this.moveStock(tx, {
          sourceWarehouse: originWarehouse,
          targetWarehouse: destinationWarehouse,
          productId: detail.productId,
          productName: product?.name || detail.productId,
          quantity: detail.quantity,
          userId,
          referenceId: transfer.id,
          transferNumber,
          sourceMovementType: $Enums.InventoryMovementType.TRANSFER_OUT,
          targetMovementType: $Enums.InventoryMovementType.TRANSFER_IN,
        });
      }

      return tx.warehouseTransfer.findUnique({
        where: {
          id: transfer.id,
        },
        include: this.transferInclude(),
      });
    });
  }

  async cancel(id: string, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.warehouseTransfer.findUnique({
        where: { id },
        include: {
          originWarehouse: {
            select: {
              id: true,
              name: true,
            },
          },
          destinationWarehouse: {
            select: {
              id: true,
              name: true,
            },
          },
          details: {
            include: {
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!transfer) {
        throw new NotFoundException(`Transferencia con ID ${id} no encontrada`);
      }

      if (transfer.status === $Enums.WarehouseTransferStatus.CANCELLED) {
        throw new BadRequestException('La transferencia ya fue anulada');
      }

      const locked = await tx.warehouseTransfer.updateMany({
        where: {
          id,
          status: $Enums.WarehouseTransferStatus.COMPLETED,
        },
        data: {
          status: $Enums.WarehouseTransferStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      if (locked.count !== 1) {
        throw new BadRequestException(
          'La transferencia ya no está disponible para anular',
        );
      }

      for (const detail of transfer.details) {
        await this.moveStock(tx, {
          sourceWarehouse: transfer.destinationWarehouse,
          targetWarehouse: transfer.originWarehouse,
          productId: detail.productId,
          productName: detail.product.name,
          quantity: detail.quantity,
          userId,
          referenceId: transfer.id,
          transferNumber: transfer.transferNumber,
          sourceMovementType: $Enums.InventoryMovementType.TRANSFER_CANCEL_OUT,
          targetMovementType: $Enums.InventoryMovementType.TRANSFER_CANCEL_IN,
          isCancellation: true,
        });
      }

      return tx.warehouseTransfer.findUnique({
        where: { id },
        include: this.transferInclude(),
      });
    });
  }

  private async moveStock(
    tx: any,
    params: {
      sourceWarehouse: {
        id: string;
        name: string;
      };
      targetWarehouse: {
        id: string;
        name: string;
      };
      productId: string;
      productName: string;
      quantity: number;
      userId: number;
      referenceId: string;
      transferNumber: string;
      sourceMovementType: $Enums.InventoryMovementType;
      targetMovementType: $Enums.InventoryMovementType;
      isCancellation?: boolean;
    },
  ) {
    const sourceStock = await tx.warehouseStock.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: params.sourceWarehouse.id,
          productId: params.productId,
        },
      },
      select: {
        id: true,
        stock: true,
        reservedStock: true,
      },
    });

    const availableStock = sourceStock
      ? this.roundQuantity(sourceStock.stock - sourceStock.reservedStock)
      : 0;

    if (!sourceStock || availableStock + STOCK_EPSILON < params.quantity) {
      const action = params.isCancellation
        ? 'anular la transferencia'
        : 'realizar la transferencia';

      throw new BadRequestException(
        `No se puede ${action}: "${params.productName}" tiene ${availableStock} disponibles en ${params.sourceWarehouse.name} y se requieren ${params.quantity}`,
      );
    }

    const decremented = await tx.warehouseStock.updateMany({
      where: {
        id: sourceStock.id,
        stock: {
          gte: sourceStock.reservedStock + params.quantity - STOCK_EPSILON,
        },
      },
      data: {
        stock: {
          decrement: params.quantity,
        },
      },
    });

    if (decremented.count !== 1) {
      throw new BadRequestException(
        `El stock de "${params.productName}" cambió durante la operación. Vuelve a intentarlo`,
      );
    }

    const updatedSource = await tx.warehouseStock.findUnique({
      where: {
        id: sourceStock.id,
      },
      select: {
        stock: true,
      },
    });

    const updatedTarget = await tx.warehouseStock.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: params.targetWarehouse.id,
          productId: params.productId,
        },
      },
      create: {
        warehouseId: params.targetWarehouse.id,
        productId: params.productId,
        stock: params.quantity,
      },
      update: {
        stock: {
          increment: params.quantity,
        },
      },
      select: {
        stock: true,
      },
    });

    const sourceNewStock = this.roundQuantity(
      updatedSource?.stock ?? sourceStock.stock - params.quantity,
    );
    const targetNewStock = this.roundQuantity(updatedTarget.stock);
    const operation = params.isCancellation ? 'Anulación' : 'Transferencia';
    const observations = `${operation} ${params.transferNumber}: ${params.sourceWarehouse.name} → ${params.targetWarehouse.name}`;

    await tx.inventoryMovement.createMany({
      data: [
        {
          warehouseId: params.sourceWarehouse.id,
          productId: params.productId,
          userId: params.userId,
          type: params.sourceMovementType,
          quantity: params.quantity,
          previousStock: sourceStock.stock,
          newStock: sourceNewStock,
          referenceId: params.referenceId,
          observations,
        },
        {
          warehouseId: params.targetWarehouse.id,
          productId: params.productId,
          userId: params.userId,
          type: params.targetMovementType,
          quantity: params.quantity,
          previousStock: this.roundQuantity(targetNewStock - params.quantity),
          newStock: targetNewStock,
          referenceId: params.referenceId,
          observations,
        },
      ],
    });
  }
}
