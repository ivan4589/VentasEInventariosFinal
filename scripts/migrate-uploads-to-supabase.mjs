import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import pg from 'pg';

const execute = process.argv.includes('--execute');
const uploadsRoot = resolve(process.env.UPLOADS_DIR || 'uploads');
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const privateBucket =
  process.env.SUPABASE_PRIVATE_BUCKET || 'private-documents';
const publicBucket = process.env.SUPABASE_PUBLIC_BUCKET || 'product-images';
const databaseUrl = process.env.DATABASE_URL;
const privateFolders = new Set([
  'reports',
  'purchases',
  'sales',
  'collections',
]);

if (execute && (!supabaseUrl || !serviceRoleKey)) {
  throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios');
}
if (execute && !databaseUrl) {
  throw new Error('DATABASE_URL es obligatorio al usar --execute');
}

function headers(extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

function contentType(filename) {
  return (
    {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    }[extname(filename).toLowerCase()] || 'application/octet-stream'
  );
}

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(
    (error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  )) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function migrationTarget(filePath) {
  const localKey = relative(uploadsRoot, filePath).split(sep).join('/');
  const [folder, ...rest] = localKey.split('/');
  if (!rest.length) return null;
  if (folder === 'products') {
    return {
      bucket: publicBucket,
      key: localKey,
      public: true,
      legacyUrl: `/uploads/${localKey}`,
    };
  }
  if (privateFolders.has(folder)) {
    return { bucket: privateBucket, key: localKey, public: false };
  }
  return null;
}

async function ensureBucket(id, isPublic) {
  const current = await fetch(
    `${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(id)}`,
    { headers: headers() },
  );
  if (current.ok) return;
  if (current.status !== 404) {
    throw new Error(`No se pudo consultar el bucket ${id}: ${current.status}`);
  }
  const created = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      id,
      name: id,
      public: isPublic,
      file_size_limit: isPublic ? 2 * 1024 * 1024 : 25 * 1024 * 1024,
      allowed_mime_types: isPublic
        ? ['image/jpeg', 'image/png', 'image/webp']
        : ['application/pdf'],
    }),
  });
  if (!created.ok) {
    throw new Error(
      `No se pudo crear el bucket ${id}: ${created.status} ${await created.text()}`,
    );
  }
}

async function upload(filePath, target) {
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${target.bucket}/${encodeKey(target.key)}`,
    {
      method: 'POST',
      headers: headers({
        'Content-Type': contentType(filePath),
        'x-upsert': 'true',
      }),
      body: new Uint8Array(await readFile(filePath)),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Falló ${target.key}: ${response.status} ${await response.text()}`,
    );
  }
}

const files = (await collectFiles(uploadsRoot))
  .map((filePath) => ({ filePath, target: migrationTarget(filePath) }))
  .filter(({ target }) => target);

console.log(
  `${execute ? 'EJECUCIÓN' : 'SIMULACIÓN'}: ${files.length} archivos compatibles encontrados`,
);
for (const { target } of files) {
  console.log(`- ${target.key} -> ${target.bucket}`);
}

if (!execute) {
  console.log('No se realizaron cambios. Repite con --execute para migrar.');
  process.exit(0);
}

await ensureBucket(publicBucket, true);
await ensureBucket(privateBucket, false);

const { Pool } = pg;
const pool = new Pool({ connectionString: databaseUrl });
let migrated = 0;
let updatedProducts = 0;
try {
  for (const item of files) {
    await upload(item.filePath, item.target);
    migrated += 1;
    if (item.target.public) {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${publicBucket}/${encodeKey(item.target.key)}`;
      const result = await pool.query(
        'UPDATE "Product" SET "imageUrl" = $1 WHERE "imageUrl" = $2',
        [publicUrl, item.target.legacyUrl],
      );
      updatedProducts += result.rowCount || 0;
    }
  }
} finally {
  await pool.end();
}

console.log(
  `Migración terminada: ${migrated} archivos subidos y ${updatedProducts} productos actualizados.`,
);
console.log(
  'Los archivos locales se conservaron como respaldo; no se eliminó ninguno.',
);
