import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createLocationDto: CreateLocationDto) {
    const existingLocation = await this.prisma.location.findUnique({
      where: { name: createLocationDto.name },
    });

    if (existingLocation) {
      throw new ConflictException('La localidad ya existe');
    }

    return this.prisma.location.create({
      data: {
        name: createLocationDto.name,
      },
    });
  }

  async findAll() {
    return this.prisma.location.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
    });

    if (!location) {
      throw new NotFoundException(`Localidad con ID ${id} no encontrada`);
    }

    return location;
  }

  async update(id: string, updateLocationDto: UpdateLocationDto) {
    const location = await this.prisma.location.findUnique({
      where: { id },
    });

    if (!location) {
      throw new NotFoundException(`Localidad con ID ${id} no encontrada`);
    }

    if (updateLocationDto.name) {
      const existingLocation = await this.prisma.location.findUnique({
        where: { name: updateLocationDto.name },
      });

      if (existingLocation && existingLocation.id !== id) {
        throw new ConflictException('Ya existe otra localidad con ese nombre');
      }
    }

    return this.prisma.location.update({
      where: { id },
      data: updateLocationDto,
    });
  }

  async remove(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
    });

    if (!location) {
      throw new NotFoundException(`Localidad con ID ${id} no encontrada`);
    }

    await this.prisma.location.delete({
      where: { id },
    });

    return {
      message: 'Localidad eliminada correctamente',
    };
  }
}