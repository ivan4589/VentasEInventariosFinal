import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { DataAuditService } from '../data-protection/data-audit.service';
import {
  normalizeDisplayText,
  normalizeOptionalEmail,
  normalizeOptionalPhone,
  normalizeOptionalText,
  normalizeSearchText,
} from '../data-protection/data-normalization';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { ProviderResponseDto } from './dto/provider-response.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: DataAuditService,
  ) {}

  private toResponse(provider: any): ProviderResponseDto {
    return {
      id: provider.id,
      companyName: provider.companyName,
      contactName: provider.contactName,
      phone: provider.phone,
      email: provider.email,
      isActive: provider.isActive,
      deletedAt: provider.deletedAt,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  private async assertAvailable(
    companyNameNormalized: string,
    phoneNormalized: string | null,
    excludeId?: string,
    database: any = this.prisma,
  ) {
    if (!phoneNormalized) {
      throw new ConflictException(
        'El proveedor debe tener un teléfono válido',
      );
    }
    const duplicate = await database.provider.findFirst({
      where: {
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [
          { phoneNormalized },
          { companyNameNormalized, phoneNormalized },
        ],
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        'Ya existe un proveedor activo con el mismo teléfono',
      );
    }
  }

  async findAll(includeInactive = false) {
    const providers = await this.prisma.provider.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { companyName: 'asc' }],
    });
    return providers.map((provider) => this.toResponse(provider));
  }

  async findOne(id: string, includeInactive = false) {
    const provider = await this.prisma.provider.findFirst({
      where: { id, ...(includeInactive ? {} : { isActive: true }) },
    });
    if (!provider) throw new NotFoundException('Proveedor no encontrado');
    return this.toResponse(provider);
  }

  async create(dto: CreateProviderDto, actorId: number) {
    const companyName = normalizeDisplayText(dto.companyName);
    const companyNameNormalized = normalizeSearchText(companyName);
    const phoneNormalized = normalizeOptionalPhone(dto.phone);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertAvailable(
          companyNameNormalized,
          phoneNormalized,
          undefined,
          tx,
        );
        const provider = await tx.provider.create({
          data: {
            companyName,
            companyNameNormalized,
            contactName: normalizeOptionalText(dto.contactName),
            phone: normalizeOptionalText(dto.phone),
            phoneNormalized,
            email: normalizeOptionalEmail(dto.email),
          },
        });
        await this.audit.record(
          {
            userId: actorId,
            action: 'PROVIDER_CREATED',
            entityType: 'PROVIDER',
            entityId: provider.id,
            after: this.toResponse(provider),
          },
          tx,
        );
        return this.toResponse(provider);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un proveedor activo con el mismo teléfono',
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProviderDto, actorId: number) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.provider.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Proveedor no encontrado');
      const companyName =
        dto.companyName === undefined
          ? current.companyName
          : normalizeDisplayText(dto.companyName);
      const companyNameNormalized = normalizeSearchText(companyName);
      const phoneNormalized =
        dto.phone === undefined
          ? current.phoneNormalized
          : normalizeOptionalPhone(dto.phone);
      await this.assertAvailable(
        companyNameNormalized,
        phoneNormalized,
        id,
        tx,
      );
      const updated = await tx.provider.update({
        where: { id },
        data: {
          companyName:
            dto.companyName === undefined ? undefined : companyName,
          companyNameNormalized,
          contactName:
            dto.contactName === undefined
              ? undefined
              : normalizeOptionalText(dto.contactName),
          phone:
            dto.phone === undefined
              ? undefined
              : normalizeOptionalText(dto.phone),
          phoneNormalized:
            dto.phone === undefined ? undefined : phoneNormalized,
          email:
            dto.email === undefined
              ? undefined
              : normalizeOptionalEmail(dto.email),
        },
      });
      await this.audit.record(
        {
          userId: actorId,
          action: 'PROVIDER_UPDATED',
          entityType: 'PROVIDER',
          entityId: id,
          before: this.toResponse(current),
          after: this.toResponse(updated),
        },
        tx,
      );
      return this.toResponse(updated);
    });
  }

  async deactivate(id: string, actorId: number, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.provider.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Proveedor no encontrado');
      if (!current.isActive) return this.toResponse(current);
      const updated = await tx.provider.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      });
      await this.audit.record(
        {
          userId: actorId,
          action: 'PROVIDER_DEACTIVATED',
          entityType: 'PROVIDER',
          entityId: id,
          reason,
          before: this.toResponse(current),
          after: this.toResponse(updated),
        },
        tx,
      );
      return this.toResponse(updated);
    });
  }

  async reactivate(id: string, actorId: number, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.provider.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Proveedor no encontrado');
      if (current.isActive) return this.toResponse(current);
      await this.assertAvailable(
        current.companyNameNormalized,
        current.phoneNormalized,
        id,
        tx,
      );
      const updated = await tx.provider.update({
        where: { id },
        data: { isActive: true, deletedAt: null },
      });
      await this.audit.record(
        {
          userId: actorId,
          action: 'PROVIDER_REACTIVATED',
          entityType: 'PROVIDER',
          entityId: id,
          reason,
          before: this.toResponse(current),
          after: this.toResponse(updated),
        },
        tx,
      );
      return this.toResponse(updated);
    });
  }
}
