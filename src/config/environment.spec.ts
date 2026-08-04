import { validateEnvironment } from './environment';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/ventas',
  JWT_SECRET: 'development-secret',
  TWO_FACTOR_ENCRYPTION_KEY: 'development-encryption-key',
  FRONTEND_URL: 'http://localhost:5173',
};

describe('production environment validation', () => {
  it('normaliza valores seguros de producción', () => {
    const config = validateEnvironment({
      ...base,
      NODE_ENV: 'production',
      JWT_SECRET: 'jwt-'.padEnd(40, 'a'),
      TWO_FACTOR_ENCRYPTION_KEY: 'two-factor-'.padEnd(40, 'b'),
      FRONTEND_URL: 'https://ventas.example.com/app',
      CORS_ORIGINS: 'https://ventas.example.com, https://admin.example.com',
      COOKIE_SECURE: 'true',
      COOKIE_SAME_SITE: 'none',
    });

    expect(config.FRONTEND_URL).toBe('https://ventas.example.com');
    expect(config.CORS_ORIGINS).toBe(
      'https://ventas.example.com,https://admin.example.com',
    );
    expect(config.TRUST_PROXY).toBe('true');
  });

  it('rechaza secretos de ejemplo en producción', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        JWT_SECRET: 'REEMPLAZAR_CON_UN_SECRETO_GENERADO',
        TWO_FACTOR_ENCRYPTION_KEY: 'two-factor-'.padEnd(40, 'b'),
        FRONTEND_URL: 'https://ventas.example.com',
      }),
    ).toThrow('JWT_SECRET');
  });

  it('rechaza cookies u orígenes inseguros en producción', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        JWT_SECRET: 'jwt-'.padEnd(40, 'a'),
        TWO_FACTOR_ENCRYPTION_KEY: 'two-factor-'.padEnd(40, 'b'),
        FRONTEND_URL: 'http://ventas.example.com',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow('HTTPS');
  });
});
