import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientResponseDto } from './dto/client-response.dto';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  private toResponse(client: any): ClientResponseDto {
    // Excluimos datos internos si los hubiera
    const { location, ...rest } = client;
    return {
      ...rest,
      locationId: client.locationId,
    };
  }

  async findAll(): Promise<ClientResponseDto[]> {
    const clients = await this.prisma.client.findMany({
      include: { location: true }, // opcional, pero no lo incluimos en la respuesta
    });
    return clients.map(c => this.toResponse(c));
  }

  async findOne(id: string): Promise<ClientResponseDto> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { location: true },
    });
    if (!client) throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    return this.toResponse(client);
  }

  async create(createClientDto: CreateClientDto): Promise<ClientResponseDto> {
    // Verificar que la localidad existe
    const location = await this.prisma.location.findUnique({
      where: { id: createClientDto.locationId },
    });
    if (!location) throw new NotFoundException('Localidad no encontrada');

    const client = await this.prisma.client.create({
      data: {
        fullName: createClientDto.fullName,
        alias: createClientDto.alias,
        type: createClientDto.type,
        locationId: createClientDto.locationId,
        phone: createClientDto.phone,
        additionalInfo: createClientDto.additionalInfo,
      },
    });
    return this.toResponse(client);
  }

  async update(id: string, updateClientDto: UpdateClientDto): Promise<ClientResponseDto> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente con ID ${id} no encontrado`);

    if (updateClientDto.locationId) {
      const location = await this.prisma.location.findUnique({
        where: { id: updateClientDto.locationId },
      });
      if (!location) throw new NotFoundException('Localidad no encontrada');
    }

    const updated = await this.prisma.client.update({
      where: { id },
      data: {
        fullName: updateClientDto.fullName,
        alias: updateClientDto.alias,
        type: updateClientDto.type,
        locationId: updateClientDto.locationId,
        phone: updateClientDto.phone,
        additionalInfo: updateClientDto.additionalInfo,
      },
    });
    return this.toResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    await this.prisma.client.delete({ where: { id } });
  }

  // Método adicional: buscar clientes por localidad
  async findByLocation(locationId: string): Promise<ClientResponseDto[]> {
    const clients = await this.prisma.client.findMany({
      where: { locationId },
    });
    return clients.map(c => this.toResponse(c));
  }

  // Método adicional: buscar por tipo
  async findByType(type: string): Promise<ClientResponseDto[]> {
    const clients = await this.prisma.client.findMany({
      where: { type: type as any },
    });
    return clients.map(c => this.toResponse(c));
  }
}