import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface DataAuditInput {
  userId: number;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class DataAuditService {
  constructor(private readonly prisma: PrismaService) {}

  private json(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  record(input: DataAuditInput, database: any = this.prisma) {
    return database.dataAuditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        reason: input.reason || null,
        before: this.json(input.before),
        after: this.json(input.after),
      },
    });
  }
}
