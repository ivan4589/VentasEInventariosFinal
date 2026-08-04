import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JsonLogger } from './json-logger.service';

type RequestWithId = Request & { requestId?: string };

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const detail =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = typeof detail === 'object' && detail !== null ? detail : {};
    const rawMessage =
      typeof detail === 'string'
        ? detail
        : (body as { message?: string | string[] }).message;
    const message =
      status >= 500
        ? 'Ocurrió un error interno. Intenta nuevamente.'
        : rawMessage || 'La solicitud no pudo procesarse';
    const code = (body as { code?: string }).code;

    this.logger.error(
      {
        event: 'http_request_failed',
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl,
        status,
        error: exception instanceof Error ? exception.name : 'UnknownException',
      },
      exception instanceof Error ? exception.stack : undefined,
      GlobalExceptionFilter.name,
    );

    response.status(status).json({
      statusCode: status,
      message,
      ...(code ? { code } : {}),
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}
