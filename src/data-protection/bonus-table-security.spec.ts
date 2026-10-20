import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('protección de las tablas de bonificaciones', () => {
  const sql = readFileSync(
    join(__dirname, '../../prisma/migrations/20261020050000_secure_bonus_tables/migration.sql'),
    'utf8',
  );

  it.each(['bonus_rules', 'sale_bonus_details'])('activa RLS en %s', table => {
    expect(sql).toContain(`ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY;`);
  });

  it.each(['anon', 'authenticated'])('revoca permisos de %s solo cuando existe', role => {
    expect(sql).toContain(`IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}')`);
    expect(sql).toContain(`REVOKE ALL PRIVILEGES ON TABLE public.bonus_rules, public.sale_bonus_details FROM ${role};`);
  });

  it('no cambia datos, políticas de acceso público ni el acceso del propietario', () => {
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|INSERT|DROP|TRUNCATE|GRANT)\b/i);
    expect(sql).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
