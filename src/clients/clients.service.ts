import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { DataAuditService } from '../data-protection/data-audit.service';
import {
  normalizeDisplayText,
  normalizeOptionalPhone,
  normalizeOptionalText,
} from '../data-protection/data-normalization';
import { PrismaService } from '../prisma/prisma.service';
import { ClientResponseDto } from './dto/client-response.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: DataAuditService,
  ) {}

  private include() {
    return { location: true } as const;
  }

  private toResponse(client: any): ClientResponseDto {
    return {
      id: client.id,
      fullName: client.fullName,
      alias: client.alias,
      type: client.type,
      locationId: client.locationId,
      locationName: client.location?.name,
      phone: client.phone,
      whatsappConsent: client.whatsappConsent,
      additionalInfo: client.additionalInfo,
      isActive: client.isActive,
      deletedAt: client.deletedAt,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  private async assertLocation(locationId: string, database: any = this.prisma) {
    const location = await database.location.findUnique({
      where: { id: locationId },
      select: { id: true },
    });
    if (!location) throw new NotFoundException('Localidad no encontrada');
  }

  private async assertPhoneAvailable(
    phoneNormalized: string | null,
    excludeId?: string,
    database: any = this.prisma,
  ) {
    if (!phoneNormalized) return;
    const duplicate = await database.client.findFirst({
      where: {
        phoneNormalized,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        'Ya existe un cliente activo con el mismo teléfono',
      );
    }
  }

  async findAll(includeInactive = false): Promise<ClientResponseDto[]> {
    const clients = await this.prisma.client.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: this.include(),
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
    });
    return clients.map((client) => this.toResponse(client));
  }

  async findOne(id: string, includeInactive = false) {
    const client = await this.prisma.client.findFirst({
      where: { id, ...(includeInactive ? {} : { isActive: true }) },
      include: this.include(),
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return this.toResponse(client);
  }

  async create(dto: CreateClientDto, actorId: number) {
    const phoneNormalized = normalizeOptionalPhone(dto.phone);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertLocation(dto.locationId, tx);
        await this.assertPhoneAvailable(phoneNormalized, undefined, tx);
        const client = await tx.client.create({
          data: {
            fullName: normalizeDisplayText(dto.fullName),
            alias: normalizeOptionalText(dto.alias),
            type: dto.type,
            locationId: dto.locationId,
            phone: normalizeOptionalText(dto.phone),
            phoneNormalized,
            whatsappConsent: dto.whatsappConsent ?? false,
            additionalInfo: normalizeOptionalText(dto.additionalInfo),
          },
          include: this.include(),
        });
        await this.audit.record(
          {
            userId: actorId,
            action: 'CLIENT_CREATED',
            entityType: 'CLIENT',
            entityId: client.id,
            after: this.toResponse(client),
          },
          tx,
        );
        return this.toResponse(client);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un cliente activo con el mismo teléfono',
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateClientDto, actorId: number) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.client.findUnique({
        where: { id },
        include: this.include(),
      });
      if (!current) throw new NotFoundException('Cliente no encontrado');
      if (dto.locationId) await this.assertLocation(dto.locationId, tx);

      const phoneNormalized =
        dto.phone === undefined
          ? current.phoneNormalized
          : normalizeOptionalPhone(dto.phone);
      await this.assertPhoneAvailable(phoneNormalized, id, tx);

      const updated = await tx.client.update({
        where: { id },
        data: {
          fullName:
            dto.fullName === undefined
              ? undefined
              : normalizeDisplayText(dto.fullName),
          alias:
            dto.alias === undefined
              ? undefined
              : normalizeOptionalText(dto.alias),
          type: dto.type,
          locationId: dto.locationId,
          phone:
            dto.phone === undefined
              ? undefined
              : normalizeOptionalText(dto.phone),
          phoneNormalized:
            dto.phone === undefined ? undefined : phoneNormalized,
          whatsappConsent: dto.whatsappConsent,
          additionalInfo:
            dto.additionalInfo === undefined
              ? undefined
              : normalizeOptionalText(dto.additionalInfo),
        },
        include: this.include(),
      });
      await this.audit.record(
        {
          userId: actorId,
          action: 'CLIENT_UPDATED',
          entityType: 'CLIENT',
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
      const current = await tx.client.findUnique({
        where: { id },
        include: this.include(),
      });
      if (!current) throw new NotFoundException('Cliente no encontrado');
      if (!current.isActive) return this.toResponse(current);
      const updated = await tx.client.update({
        where: { id },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
        include: this.include(),
      });
      await this.audit.record(
        {
          userId: actorId,
          action: 'CLIENT_DEACTIVATED',
          entityType: 'CLIENT',
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
      const current = await tx.client.findUnique({
        where: { id },
        include: this.include(),
      });
      if (!current) throw new NotFoundException('Cliente no encontrado');
      if (current.isActive) return this.toResponse(current);
      await this.assertPhoneAvailable(current.phoneNormalized, id, tx);
      const updated = await tx.client.update({
        where: { id },
        data: { isActive: true, deletedAt: null },
        include: this.include(),
      });
      await this.audit.record(
        {
          userId: actorId,
          action: 'CLIENT_REACTIVATED',
          entityType: 'CLIENT',
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

  async findByLocation(locationId: string, includeInactive = false) {
    const clients = await this.prisma.client.findMany({
      where: {
        locationId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: this.include(),
      orderBy: { fullName: 'asc' },
    });
    return clients.map((client) => this.toResponse(client));
  }

  async findByType(type: string, includeInactive = false) {
    const clients = await this.prisma.client.findMany({
      where: {
        type: type as any,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: this.include(),
      orderBy: { fullName: 'asc' },
    });
    return clients.map((client) => this.toResponse(client));
  }
}
