import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/observability/global-exception.filter';
import { JsonLogger } from './common/observability/json-logger.service';

type RequestWithId = Request & { requestId?: string };

const logger = new JsonLogger();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger,
    rawBody: true,
  });
  app.useLogger(logger);
  app.enableShutdownHooks();
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');

  if (process.env.TRUST_PROXY === 'true') {
    express.set('trust proxy', 1);
  }

  app.use((request: RequestWithId, response: Response, next: NextFunction) => {
    const suppliedId = request.header('x-request-id')?.trim();
    request.requestId =
      suppliedId && /^[A-Za-z0-9._:-]{8,128}$/.test(suppliedId)
        ? suppliedId
        : randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    const startedAt = process.hrtime.bigint();

    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );

    if (process.env.NODE_ENV === 'production') {
      response.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }

    response.once('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.log(
        {
          event: 'http_request',
          requestId: request.requestId,
          method: request.method,
          path: request.originalUrl.split('?')[0],
          status: response.statusCode,
          durationMs: Number(durationMs.toFixed(2)),
        },
        'HttpRequest',
      );
    });
    next();
  });

  const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id'],
    credentials: true,
  });

  app.useStaticAssets(join(process.cwd(), 'uploads', 'products'), {
    prefix: '/uploads/products/',
    fallthrough: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter(logger));

  app.setGlobalPrefix('api');
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log({ event: 'application_started', port }, 'Bootstrap');
}

void bootstrap().catch((error: unknown) => {
  logger.error(
    { event: 'application_start_failed' },
    error instanceof Error ? error.stack : String(error),
    'Bootstrap',
  );
  process.exitCode = 1;
});
