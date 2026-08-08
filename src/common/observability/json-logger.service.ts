import { Injectable, type LoggerService } from '@nestjs/common';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

@Injectable()
export class JsonLogger implements LoggerService {
  private readonly minimum =
    PRIORITY[(process.env.LOG_LEVEL as LogLevel) || 'info'] ?? PRIORITY.info;

  log(message: unknown, context?: string) {
    this.write('info', message, context);
  }

  fatal(message: unknown, context?: string) {
    this.write('error', message, context);
  }

  error(message: unknown, trace?: string, context?: string) {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write('debug', message, context);
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    trace?: string,
  ) {
    if (PRIORITY[level] < this.minimum) return;
    const serializedMessage =
      message instanceof Error
        ? {
            error: {
              name: message.name,
              message: message.message,
            },
          }
        : typeof message === 'object' && message !== null
          ? { data: message }
          : { message: String(message) };
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service: process.env.SERVICE_NAME || 'ventas-backend',
      context,
      ...serializedMessage,
      ...(trace && process.env.NODE_ENV !== 'production' ? { trace } : {}),
    };
    const output = `${JSON.stringify(record)}\n`;
    (level === 'error' || level === 'warn'
      ? process.stderr
      : process.stdout
    ).write(output);
  }
}
