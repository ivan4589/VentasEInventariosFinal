import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('WhatsApp contact table security', () => {
  const sql = readFileSync(join(__dirname, '../../prisma/migrations/20261102090000_secure_client_contacts/migration.sql'), 'utf8');
  it('enables RLS and revokes public access', () => {
    expect(sql).toContain('ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('REVOKE ALL PRIVILEGES ON TABLE public.client_contacts FROM PUBLIC;');
  });
  it.each(['anon', 'authenticated'])('revokes %s access only if the role exists', role => {
    expect(sql).toContain(`IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}')`);
    expect(sql).toContain(`REVOKE ALL PRIVILEGES ON TABLE public.client_contacts FROM ${role};`);
  });
  it('preserves data and owner access without adding public policies', () => {
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|INSERT|DROP|TRUNCATE|GRANT)\b/i);
    expect(sql).not.toMatch(/FORCE ROW LEVEL SECURITY|CREATE POLICY/i);
  });
});
