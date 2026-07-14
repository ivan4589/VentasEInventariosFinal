import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.location.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
    });
    if (!location) throw new NotFoundException(`Localidad con ID ${id} no encontrada`);
    return location;
  }

  async create(createLocationDto: CreateLocationDto) {
    const existing = await this.prisma.location.findUnique({
      where: { name: createLocationDto.name },
    });
    if (existing) {
      throw new ConflictException('La localidad ya existe');
    }
    return this.prisma.location.create({
      data: createLocationDto,
    });
  }

  async update(id: string, updateLocationDto: UpdateLocationDto) {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) throw new NotFoundException(`Localidad con ID ${id} no encontrada`);

    if (updateLocationDto.name) {
      const existing = await this.prisma.location.findUnique({
        where: { name: updateLocationDto.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('El nombre de localidad ya está en uso');
      }
    }

    return this.prisma.location.update({
      where: { id },
      data: updateLocationDto,
    });
  }

  async remove(id: string) {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) throw new NotFoundException(`Localidad con ID ${id} no encontrada`);
    return this.prisma.location.delete({ where: { id } });
  }
}