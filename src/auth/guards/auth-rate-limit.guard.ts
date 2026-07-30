import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  AUTH_RATE_LIMIT_KEY,
  AuthRateLimitOptions,
} from '../decorators/auth-rate-limit.decorator';

type RateEntry = {
  count: number;
  windowEndsAt: number;
  blockedUntil: number;
};

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly entries = new Map<string, RateEntry>();
  private cleanupCounter = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<AuthRateLimitOptions>(
      AUTH_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const key = this.keyFor(request, options);
    const current = this.entries.get(key);

    if (current?.blockedUntil && current.blockedUntil > now) {
      this.throwRateLimit();
    }

    const entry =
      !current || current.windowEndsAt <= now
        ? {
            count: 0,
            windowEndsAt: now + options.windowMs,
            blockedUntil: 0,
          }
        : current;

    entry.count += 1;

    if (entry.count > options.limit) {
      entry.blockedUntil = now + (options.blockMs ?? options.windowMs);
      this.entries.set(key, entry);
      this.throwRateLimit();
    }

    this.entries.set(key, entry);
    this.cleanup(now);
    return true;
  }

  private throwRateLimit(): never {
    throw new HttpException(
      'Demasiados intentos. Espera unos minutos antes de volver a intentar.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private keyFor(request: Request, options: AuthRateLimitOptions) {
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const body = (request.body || {}) as Record<string, unknown>;
    const fields = new Set(options.bodyFields || []);
    if (options.includeEmail) fields.add('email');

    const bodyKey = Array.from(fields)
      .sort()
      .map((field) => {
        const value = String(body[field] ?? '').trim();
        const normalized = field === 'email' ? value.toLowerCase() : value;
        return `${field}=${normalized}`;
      })
      .join('&');

    return `${request.method}:${request.route?.path || request.path}:${ip}:${bodyKey}`;
  }

  private cleanup(now: number) {
    this.cleanupCounter += 1;
    if (this.cleanupCounter % 100 !== 0) return;

    for (const [key, entry] of this.entries.entries()) {
      if (entry.windowEndsAt <= now && entry.blockedUntil <= now) {
        this.entries.delete(key);
      }
    }
  }
}
