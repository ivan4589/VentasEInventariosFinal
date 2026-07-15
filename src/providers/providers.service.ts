import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProviderResponseDto } from './dto/provider-response.dto';

@Injectable()
export class ProvidersService {
  constructor(private prisma: PrismaService) {}

  private toResponse(provider: any): ProviderResponseDto {
    const { ...rest } = provider;
    return rest;
  }

  async findAll(): Promise<ProviderResponseDto[]> {
    const providers = await this.prisma.provider.findMany();
    return providers.map(p => this.toResponse(p));
  }

  async findOne(id: string): Promise<ProviderResponseDto> {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    return this.toResponse(provider);
  }

  async create(createProviderDto: CreateProviderDto): Promise<ProviderResponseDto> {
    // Verificar si ya existe un proveedor con el mismo nombre de empresa
    const existing = await this.prisma.provider.findUnique({
      where: { companyName: createProviderDto.companyName },
    });
    if (existing) {
      throw new ConflictException(`Ya existe un proveedor con el nombre "${createProviderDto.companyName}"`);
    }

    const provider = await this.prisma.provider.create({
      data: {
        companyName: createProviderDto.companyName,
        contactName: createProviderDto.contactName,
        phone: createProviderDto.phone,
        email: createProviderDto.email,
      },
    });
    return this.toResponse(provider);
  }

  async update(id: string, updateProviderDto: UpdateProviderDto): Promise<ProviderResponseDto> {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);

    // Si se actualiza el nombre, verificar que no esté en uso por otro proveedor
    if (updateProviderDto.companyName) {
      const existing = await this.prisma.provider.findUnique({
        where: { companyName: updateProviderDto.companyName },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Ya existe un proveedor con el nombre "${updateProviderDto.companyName}"`);
      }
    }

    const updated = await this.prisma.provider.update({
      where: { id },
      data: {
        companyName: updateProviderDto.companyName,
        contactName: updateProviderDto.contactName,
        phone: updateProviderDto.phone,
        email: updateProviderDto.email,
      },
    });
    return this.toResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);

    // Verificar si el proveedor tiene productos asociados
    const productsCount = await this.prisma.product.count({
      where: { providerId: id },
    });
    if (productsCount > 0) {
      throw new ConflictException(`No se puede eliminar el proveedor porque tiene ${productsCount} productos asociados`);
    }

    await this.prisma.provider.delete({ where: { id } });
  }
}