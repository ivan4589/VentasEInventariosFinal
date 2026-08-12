import { validateEnvironment } from './environment';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/ventas',
  JWT_SECRET: 'development-secret',
  TWO_FACTOR_ENCRYPTION_KEY: 'development-encryption-key',
  FRONTEND_URL: 'http://localhost:5173',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_'.padEnd(40, 's'),
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
    expect(config.STORAGE_DRIVER).toBe('supabase');
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

  it('normaliza la configuracion de WhatsApp', () => {
    const config = validateEnvironment({
      ...base,
      WHATSAPP_ACCESS_TOKEN: 'test-token',
      WHATSAPP_PHONE_NUMBER_ID: '1216396944894387',
      WHATSAPP_GRAPH_API_VERSION: 'v25.0',
      WHATSAPP_TEMPLATE_NAME: 'nota_venta_pdf',
      WHATSAPP_TEMPLATE_LANGUAGE: 'es',
      WHATSAPP_DEFAULT_COUNTRY_CODE: '591',
      WHATSAPP_REQUEST_TIMEOUT_MS: '20000',
    });

    expect(config.WHATSAPP_PHONE_NUMBER_ID).toBe('1216396944894387');
    expect(config.WHATSAPP_REQUEST_TIMEOUT_MS).toBe(20000);
  });

  it('rechaza una configuracion incompleta de WhatsApp', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        WHATSAPP_ACCESS_TOKEN: 'test-token',
      }),
    ).toThrow('WHATSAPP_PHONE_NUMBER_ID');
  });
});
