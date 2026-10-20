// node-postgres accepts no-verify; libpq/pg_dump calls the same encrypted,
// non-certificate-validating mode require. Never downgrade verify-* modes.
export function backupSslMode(value) {
  return value === 'no-verify' ? 'require' : value;
}
