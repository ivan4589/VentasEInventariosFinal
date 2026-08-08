import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live() {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ready',
        database: 'up',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido de PostgreSQL';
      this.logger.error({
        event: 'database_readiness_failed',
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: message.replace(
            /postgres(?:ql)?:\/\/[^\s]+/gi,
            '[postgresql-url-redacted]',
          ),
        },
      });
      throw new ServiceUnavailableException({
        message: 'El servicio todavía no está listo',
        code: 'DATABASE_UNAVAILABLE',
      });
    }
  }
}
