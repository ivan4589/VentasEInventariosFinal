import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DataAuditService } from '../data-protection/data-audit.service';
import { normalizeDisplayText, normalizeOptionalPhone, normalizeOptionalText } from '../data-protection/data-normalization';
import { CreateClientContactDto, UpdateClientContactDto } from './dto/client-contact.dto';

@Injectable()
export class ClientContactsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: DataAuditService) {}

  private async client(id: string, db: any = this.prisma) {
    const client = await db.client.findFirst({ where: { id, isActive: true } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  async list(clientId: string) {
    await this.client(clientId);
    return this.prisma.clientContact.findMany({ where: { clientId }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  }

  async create(clientId: string, dto: CreateClientContactDto, userId: number) {
    const name = normalizeDisplayText(dto.name);
    if (!name) throw new BadRequestException('El nombre es obligatorio');
    const phoneNormalized = normalizeOptionalPhone(dto.phone)!;
    try {
      return await this.prisma.$transaction(async tx => {
        const client = await this.client(clientId, tx);
        if (client.phoneNormalized === phoneNormalized) throw new ConflictException('El teléfono coincide con el contacto principal');
        const contact = await tx.clientContact.create({ data: { clientId, name, relationship: normalizeOptionalText(dto.relationship), phone: dto.phone.trim(), phoneNormalized, whatsappConsent: dto.whatsappConsent ?? false, isDefault: dto.isDefault ?? false } });
        await this.audit.record({ userId, action: 'CLIENT_CONTACT_CREATED', entityType: 'CLIENT_CONTACT', entityId: contact.id, after: contact }, tx);
        return contact;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Este teléfono ya está registrado para el cliente');
      throw error;
    }
  }

  async update(clientId: string, contactId: string, dto: UpdateClientContactDto, userId: number) {
    try {
      return await this.prisma.$transaction(async tx => {
        const client = await this.client(clientId, tx);
        const current = await tx.clientContact.findFirst({ where: { id: contactId, clientId } });
        if (!current) throw new NotFoundException('Contacto no encontrado');
        const name = dto.name === undefined ? undefined : normalizeDisplayText(dto.name);
        if (name === '') throw new BadRequestException('El nombre es obligatorio');
        const phoneNormalized = dto.phone === undefined ? undefined : normalizeOptionalPhone(dto.phone)!;
        if (phoneNormalized && client.phoneNormalized === phoneNormalized) throw new ConflictException('El teléfono coincide con el contacto principal');
        const contact = await tx.clientContact.update({ where: { id: contactId }, data: { name, relationship: dto.relationship === undefined ? undefined : normalizeOptionalText(dto.relationship), phone: dto.phone?.trim(), phoneNormalized, whatsappConsent: dto.whatsappConsent, isDefault: dto.isDefault, isActive: dto.isActive } });
        await this.audit.record({ userId, action: 'CLIENT_CONTACT_UPDATED', entityType: 'CLIENT_CONTACT', entityId: contact.id, before: current, after: contact }, tx);
        return contact;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Este teléfono ya está registrado para el cliente');
      throw error;
    }
  }
}
