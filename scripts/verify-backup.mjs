import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

const backupPath = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (!backupPath) throw new Error('Uso: npm run backup:verify -- <archivo.dump>');
await access(backupPath);

await new Promise((resolveRun, reject) => {
  const child = spawn(process.env.PG_RESTORE_BIN || 'pg_restore', ['--list', backupPath], {
    stdio: ['ignore', 'ignore', 'inherit'],
    windowsHide: true,
  });
  child.once('error', reject);
  child.once('exit', (code) => {
    if (code === 0) resolveRun();
    else reject(new Error(`pg_restore finalizó con código ${code}`));
  });
});

process.stdout.write(`${JSON.stringify({ event: 'backup_verified', path: backupPath })}\n`);
