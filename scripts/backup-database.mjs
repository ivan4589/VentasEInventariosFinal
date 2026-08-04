import { spawn } from 'node:child_process';
import { chmod, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

function run(command, args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} finalizó con código ${code}`));
    });
  });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL es obligatorio para generar el respaldo');
const database = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(database.protocol)) {
  throw new Error('El respaldo solo admite bases PostgreSQL');
}

const backupDirectory = resolve(process.env.BACKUP_DIR || 'backups');
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);
if (!Number.isSafeInteger(retentionDays) || retentionDays < 1) {
  throw new Error('BACKUP_RETENTION_DAYS debe ser un entero positivo');
}

await mkdir(backupDirectory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const finalPath = resolve(backupDirectory, `ventas-${stamp}.dump`);
const partialPath = `${finalPath}.partial`;
const pgEnvironment = {
  ...process.env,
  PGHOST: database.hostname,
  PGPORT: database.port || '5432',
  PGUSER: decodeURIComponent(database.username),
  PGPASSWORD: decodeURIComponent(database.password),
  PGDATABASE: database.pathname.replace(/^\//, ''),
  ...(database.searchParams.get('sslmode')
    ? { PGSSLMODE: database.searchParams.get('sslmode') }
    : {}),
};

try {
  await run(
    process.env.PG_DUMP_BIN || 'pg_dump',
    ['--format=custom', '--compress=9', '--no-owner', '--no-acl', `--file=${partialPath}`],
    pgEnvironment,
  );
  await rename(partialPath, finalPath);
  await chmod(finalPath, 0o600).catch(() => undefined);
} catch (error) {
  await unlink(partialPath).catch(() => undefined);
  throw error;
}

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
for (const entry of await readdir(backupDirectory)) {
  if (!/^ventas-.*\.dump$/.test(entry)) continue;
  const candidate = resolve(backupDirectory, entry);
  if ((await stat(candidate)).mtimeMs < cutoff) await unlink(candidate);
}

process.stdout.write(`${JSON.stringify({ event: 'backup_completed', path: finalPath })}\n`);
