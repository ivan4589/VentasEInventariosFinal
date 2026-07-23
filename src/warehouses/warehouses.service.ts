import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const warehouses = await this.prisma.warehouse.findMany({
      include: {
        stocks: {
          select: {
            stock: true,
            reservedStock: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return warehouses.map(({ stocks, ...warehouse }) => {
      const totalStock = stocks.reduce(
        (total, item) => total + item.stock,
        0,
      );

      const reservedStock = stocks.reduce(
        (total, item) => total + item.reservedStock,
        0,
      );

      return {
        ...warehouse,
        totalStock,
        reservedStock,
        availableStock: totalStock - reservedStock,
        productsCount: stocks.filter((item) => item.stock > 0).length,
      };
    });
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        stocks: {
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
              name: 'asc',
            },
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(
        `Almacén con ID ${id} no encontrado`,
      );
    }

    return {
      ...warehouse,
      stocks: warehouse.stocks.map((item) => ({
        ...item,
        availableStock: item.stock - item.reservedStock,
      })),
    };
  }

  async create(dto: CreateWarehouseDto) {
    const name = dto.name.trim();
    const code = dto.code.trim().toUpperCase();

    const duplicate = await this.prisma.warehouse.findFirst({
      where: {
        OR: [
          {
            name: {
              equals: name,
              mode: 'insensitive',
            },
          },
          {
            code: {
              equals: code,
              mode: 'insensitive',
            },
          },
        ],
      },
    });

    if (duplicate) {
      throw new ConflictException(
        'Ya existe un almacén con ese nombre o código',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.warehouse.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      const warehouse = await tx.warehouse.create({
        data: {
          name,
          code,
          description: dto.description?.trim() || null,
          isDefault: dto.isDefault ?? false,
        },
      });

      const products = await tx.product.findMany({
        select: {
          id: true,
        },
      });

      if (products.length > 0) {
        await tx.warehouseStock.createMany({
          data: products.map((product) => ({
            warehouseId: warehouse.id,
            productId: product.id,
          })),
          skipDuplicates: true,
        });
      }

      return warehouse;
    });
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
    });

    if (!warehouse) {
      throw new NotFoundException(
        `Almacén con ID ${id} no encontrado`,
      );
    }

    const name = dto.name?.trim();
    const code = dto.code?.trim().toUpperCase();

    if (name || code) {
      const duplicate = await this.prisma.warehouse.findFirst({
        where: {
          id: {
            not: id,
          },
          OR: [
            ...(name
              ? [
                  {
                    name: {
                      equals: name,
                      mode: 'insensitive' as const,
                    },
                  },
                ]
              : []),
            ...(code
              ? [
                  {
                    code: {
                      equals: code,
                      mode: 'insensitive' as const,
                    },
                  },
                ]
              : []),
          ],
        },
      });

      if (duplicate) {
        throw new ConflictException(
          'Ya existe un almacén con ese nombre o código',
        );
      }
    }

    if (warehouse.isDefault && dto.isDefault === false) {
      throw new BadRequestException(
        'Primero debes seleccionar otro almacén como predeterminado',
      );
    }

    if (warehouse.isDefault && dto.isActive === false) {
      throw new BadRequestException(
        'No se puede desactivar el almacén predeterminado',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.warehouse.updateMany({
          where: {
            isDefault: true,
            id: {
              not: id,
            },
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.warehouse.update({
        where: { id },
        data: {
          name,
          code,
          description:
            dto.description === undefined
              ? undefined
              : dto.description.trim() || null,
          isActive: dto.isActive,
          isDefault: dto.isDefault,
        },
      });
    });
  }

  async remove(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        stocks: {
          where: {
            OR: [
              {
                stock: {
                  not: 0,
                },
              },
              {
                reservedStock: {
                  not: 0,
                },
              },
            ],
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(
        `Almacén con ID ${id} no encontrado`,
      );
    }

    if (warehouse.isDefault) {
      throw new BadRequestException(
        'No se puede desactivar el almacén predeterminado',
      );
    }

    if (warehouse.stocks.length > 0) {
      throw new BadRequestException(
        'No se puede desactivar un almacén que todavía tiene existencias',
      );
    }

    await this.prisma.warehouse.update({
      where: { id },
      data: {
        isActive: false,
      },
    });

    return {
      message: 'Almacén desactivado correctamente',
    };
  }
}