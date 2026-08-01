import {
  ConflictException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  requireOperationKey,
  requireReason,
} from './economic-integrity';

export interface EconomicExecution<T> {
  entityId: string;
  value: T;
  details?: Prisma.InputJsonValue;
}

@Injectable()
export class EconomicIntegrityService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly prisma: PrismaService) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL no está configurado');
    }
    this.pool = new Pool({
      connectionString,
      max: 5,
      application_name: 'ventas-integrity-locks',
    });
  }

  operationKey(value?: string): string {
    return requireOperationKey(value);
  }

  reason(value?: string, action?: string): string {
    return requireReason(value, action);
  }

  async run<T>(options: {
    operationKey?: string;
    locks: string[];
    userId: number;
    action: string;
    entityType: string;
    reason?: string | null;
    execute: (operationKey: string) => Promise<EconomicExecution<T>>;
    resolveExisting: (entityId: string) => Promise<T>;
  }): Promise<T> {
    const operationKey = this.operationKey(options.operationKey);
    const pendingEntityId = `PENDING:${operationKey}`;

    return this.withLocks(
      [`operation:${operationKey}`, ...options.locks],
      async () => {
        const existing = await this.prisma.economicAuditLog.findUnique({
          where: { operationKey },
        });

        if (existing) {
          // Nunca devolvemos ni volvemos a ejecutar una operación usando una
          // clave ya registrada. Esto impide que otro actor reutilice la clave
          // para consultar datos ajenos o que una solicitud distinta modifique
          // nuevamente una entidad económica.
          throw new ConflictException(
            existing.entityId.startsWith('PENDING:')
              ? 'La operación ya fue recibida y su resultado debe verificarse antes de reintentar'
              : 'La operación ya fue procesada. Actualiza la información antes de continuar',
          );
        }

        // La reserva se confirma antes de modificar ventas, pagos o stock. Si
        // el proceso se interrumpe después de que la mutación se confirmó, la
        // reserva permanece y el reintento falla de forma segura, evitando una
        // segunda aplicación del mismo movimiento.
        await this.prisma.economicAuditLog.create({
          data: {
            userId: options.userId,
            action: options.action,
            entityType: options.entityType,
            entityId: pendingEntityId,
            operationKey,
            reason: options.reason || null,
            details: {
              status: 'PENDING',
              locks: [...new Set(options.locks)].sort(),
            },
          },
        });

        const executed = await options.execute(operationKey);

        await this.prisma.economicAuditLog.update({
          where: { operationKey },
          data: {
            entityId: executed.entityId,
            details: {
              status: 'COMPLETED',
              result: executed.details || null,
            },
          },
        });

        return executed.value;
      },
    );
  }

  private async withLocks<T>(resources: string[], work: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const ordered = [...new Set(resources.filter(Boolean))].sort();

    try {
      for (const resource of ordered) {
        await client.query(
          'SELECT pg_advisory_lock(hashtext($1)::bigint)',
          [resource],
        );
      }
      return await work();
    } finally {
      await this.releaseLocks(client, ordered);
      client.release();
    }
  }

  private async releaseLocks(client: PoolClient, resources: string[]) {
    for (const resource of [...resources].reverse()) {
      try {
        await client.query(
          'SELECT pg_advisory_unlock(hashtext($1)::bigint)',
          [resource],
        );
      } catch {
        // La conexión será descartada por pg si deja de ser utilizable.
      }
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
