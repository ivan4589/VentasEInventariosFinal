const PLACEHOLDER_PATTERN =
  /reemplazar|change[-_ ]?me|ci-only|example|^(?:secret|password)(?:[-_ ].*)?$/i;

function required(config: Record<string, unknown>, name: string): string {
  const raw = config[name];
  if (typeof raw !== 'string') throw new Error(`${name} debe ser texto`);
  const value = raw.trim();
  if (!value) throw new Error(`${name} es obligatorio`);
  return value;
}

function optionalString(
  value: unknown,
  name: string,
  fallback: string,
): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') throw new Error(`${name} debe ser texto`);
  return value.trim();
}

function booleanValue(
  value: unknown,
  name: string,
  fallback: boolean,
): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${name} debe ser true o false`);
}

function positiveInteger(
  value: unknown,
  name: string,
  fallback: number,
): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  return parsed;
}

function secureSecret(config: Record<string, unknown>, name: string): string {
  const value = required(config, name);
  if (value.length < 32 || PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(
      `${name} debe tener al menos 32 caracteres y no ser un valor de ejemplo`,
    );
  }
  return value;
}

function absoluteUrl(
  value: string,
  name: string,
  requireHttps: boolean,
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} debe contener una URL absoluta válida`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} solo admite HTTP o HTTPS`);
  }
  if (requireHttps && parsed.protocol !== 'https:') {
    throw new Error(`${name} debe usar HTTPS en producción`);
  }
  return parsed.origin;
}

export function validateEnvironment(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const config = { ...input };
  const nodeEnv = optionalString(config.NODE_ENV, 'NODE_ENV', 'development');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV debe ser development, test o production');
  }
  const production = nodeEnv === 'production';
  const storageDriver = optionalString(
    config.STORAGE_DRIVER,
    'STORAGE_DRIVER',
    production ? 'supabase' : 'local',
  );
  if (!['local', 'supabase'].includes(storageDriver)) {
    throw new Error('STORAGE_DRIVER debe ser local o supabase');
  }

  let supabaseUrl = optionalString(config.SUPABASE_URL, 'SUPABASE_URL', '');
  let supabaseServiceRoleKey = optionalString(
    config.SUPABASE_SERVICE_ROLE_KEY,
    'SUPABASE_SERVICE_ROLE_KEY',
    '',
  );
  if (storageDriver === 'supabase') {
    supabaseUrl = absoluteUrl(
      required(config, 'SUPABASE_URL'),
      'SUPABASE_URL',
      production,
    );
    supabaseServiceRoleKey = production
      ? secureSecret(config, 'SUPABASE_SERVICE_ROLE_KEY')
      : required(config, 'SUPABASE_SERVICE_ROLE_KEY');
  }

  const privateBucket = optionalString(
    config.SUPABASE_PRIVATE_BUCKET,
    'SUPABASE_PRIVATE_BUCKET',
    'private-documents',
  );
  const publicBucket = optionalString(
    config.SUPABASE_PUBLIC_BUCKET,
    'SUPABASE_PUBLIC_BUCKET',
    'product-images',
  );
  for (const [name, value] of [
    ['SUPABASE_PRIVATE_BUCKET', privateBucket],
    ['SUPABASE_PUBLIC_BUCKET', publicBucket],
  ]) {
    if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(value)) {
      throw new Error(`${name} no contiene un nombre de bucket válido`);
    }
  }
  if (privateBucket === publicBucket) {
    throw new Error('Los buckets público y privado deben ser diferentes');
  }

  const databaseUrl = required(config, 'DATABASE_URL');
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL no es una URL válida');
  }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) {
    throw new Error('DATABASE_URL debe usar PostgreSQL');
  }

  const jwtSecret = production
    ? secureSecret(config, 'JWT_SECRET')
    : required(config, 'JWT_SECRET');
  const encryptionKey = production
    ? secureSecret(config, 'TWO_FACTOR_ENCRYPTION_KEY')
    : required(config, 'TWO_FACTOR_ENCRYPTION_KEY');
  if (production && jwtSecret === encryptionKey) {
    throw new Error(
      'JWT_SECRET y TWO_FACTOR_ENCRYPTION_KEY deben ser diferentes',
    );
  }

  const origins = optionalString(
    config.CORS_ORIGINS,
    'CORS_ORIGINS',
    optionalString(
      config.FRONTEND_URL,
      'FRONTEND_URL',
      'http://localhost:5173',
    ),
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => absoluteUrl(origin, 'CORS_ORIGINS', production));
  if (!origins.length)
    throw new Error('CORS_ORIGINS debe contener al menos un origen');

  const frontendUrl = absoluteUrl(
    optionalString(config.FRONTEND_URL, 'FRONTEND_URL', origins[0]),
    'FRONTEND_URL',
    production,
  );
  const cookieSecure = booleanValue(
    config.COOKIE_SECURE,
    'COOKIE_SECURE',
    production,
  );
  const cookieSameSite = optionalString(
    config.COOKIE_SAME_SITE,
    'COOKIE_SAME_SITE',
    production ? 'none' : 'lax',
  );
  if (!['lax', 'strict', 'none'].includes(cookieSameSite)) {
    throw new Error('COOKIE_SAME_SITE debe ser lax, strict o none');
  }
  if (production && !cookieSecure) {
    throw new Error('COOKIE_SECURE debe ser true en producción');
  }
  if (cookieSameSite === 'none' && !cookieSecure) {
    throw new Error('COOKIE_SAME_SITE=none requiere COOKIE_SECURE=true');
  }

  const logLevel = optionalString(config.LOG_LEVEL, 'LOG_LEVEL', 'info');
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error('LOG_LEVEL debe ser debug, info, warn o error');
  }

  const whatsappAccessToken = optionalString(
    config.WHATSAPP_ACCESS_TOKEN,
    'WHATSAPP_ACCESS_TOKEN',
    '',
  );
  const whatsappPhoneNumberId = optionalString(
    config.WHATSAPP_PHONE_NUMBER_ID,
    'WHATSAPP_PHONE_NUMBER_ID',
    '',
  );
  if (Boolean(whatsappAccessToken) !== Boolean(whatsappPhoneNumberId)) {
    throw new Error(
      'WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID deben configurarse juntos',
    );
  }
  if (whatsappPhoneNumberId && !/^\d+$/.test(whatsappPhoneNumberId)) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID debe contener solo dígitos');
  }

  const whatsappGraphApiVersion = optionalString(
    config.WHATSAPP_GRAPH_API_VERSION,
    'WHATSAPP_GRAPH_API_VERSION',
    'v25.0',
  );
  if (!/^v\d+\.\d+$/.test(whatsappGraphApiVersion)) {
    throw new Error('WHATSAPP_GRAPH_API_VERSION debe tener formato vN.N');
  }

  const whatsappTemplateName = optionalString(
    config.WHATSAPP_TEMPLATE_NAME,
    'WHATSAPP_TEMPLATE_NAME',
    'nota_venta_pdf',
  );
  if (!/^[a-z0-9_]+$/.test(whatsappTemplateName)) {
    throw new Error(
      'WHATSAPP_TEMPLATE_NAME solo admite minúsculas, números y guiones bajos',
    );
  }

  const whatsappTemplateLanguage = optionalString(
    config.WHATSAPP_TEMPLATE_LANGUAGE,
    'WHATSAPP_TEMPLATE_LANGUAGE',
    'es',
  );
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(whatsappTemplateLanguage)) {
    throw new Error('WHATSAPP_TEMPLATE_LANGUAGE no es un código válido');
  }

  const whatsappCountryCode = optionalString(
    config.WHATSAPP_DEFAULT_COUNTRY_CODE,
    'WHATSAPP_DEFAULT_COUNTRY_CODE',
    '591',
  );
  if (!/^\d{1,4}$/.test(whatsappCountryCode)) {
    throw new Error(
      'WHATSAPP_DEFAULT_COUNTRY_CODE debe contener entre 1 y 4 dígitos',
    );
  }

  const whatsappVerifyToken = optionalString(
    config.WHATSAPP_VERIFY_TOKEN,
    'WHATSAPP_VERIFY_TOKEN',
    '',
  );
  const whatsappAppSecret = optionalString(
    config.WHATSAPP_APP_SECRET,
    'WHATSAPP_APP_SECRET',
    '',
  );
  if (Boolean(whatsappVerifyToken) !== Boolean(whatsappAppSecret)) {
    throw new Error(
      'WHATSAPP_VERIFY_TOKEN y WHATSAPP_APP_SECRET deben configurarse juntos',
    );
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: positiveInteger(config.PORT, 'PORT', 3000),
    DATABASE_URL: databaseUrl,
    STORAGE_DRIVER: storageDriver,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
    SUPABASE_PRIVATE_BUCKET: privateBucket,
    SUPABASE_PUBLIC_BUCKET: publicBucket,
    JWT_SECRET: jwtSecret,
    TWO_FACTOR_ENCRYPTION_KEY: encryptionKey,
    FRONTEND_URL: frontendUrl,
    CORS_ORIGINS: [...new Set(origins)].join(','),
    COOKIE_SECURE: String(cookieSecure),
    COOKIE_SAME_SITE: cookieSameSite,
    TRUST_PROXY: String(
      booleanValue(config.TRUST_PROXY, 'TRUST_PROXY', production),
    ),
    LOG_LEVEL: logLevel,
    WHATSAPP_ACCESS_TOKEN: whatsappAccessToken,
    WHATSAPP_PHONE_NUMBER_ID: whatsappPhoneNumberId,
    WHATSAPP_GRAPH_API_VERSION: whatsappGraphApiVersion,
    WHATSAPP_TEMPLATE_NAME: whatsappTemplateName,
    WHATSAPP_TEMPLATE_LANGUAGE: whatsappTemplateLanguage,
    WHATSAPP_DEFAULT_COUNTRY_CODE: whatsappCountryCode,
    WHATSAPP_REQUEST_TIMEOUT_MS: positiveInteger(
      config.WHATSAPP_REQUEST_TIMEOUT_MS,
      'WHATSAPP_REQUEST_TIMEOUT_MS',
      15000,
    ),
    WHATSAPP_VERIFY_TOKEN: whatsappVerifyToken,
    WHATSAPP_APP_SECRET: whatsappAppSecret,
    BACKUP_RETENTION_DAYS: positiveInteger(
      config.BACKUP_RETENTION_DAYS,
      'BACKUP_RETENTION_DAYS',
      14,
    ),
  };
}
