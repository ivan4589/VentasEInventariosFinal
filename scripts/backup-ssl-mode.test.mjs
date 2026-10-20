import assert from 'node:assert/strict';
import test from 'node:test';
import { backupSslMode } from './backup-ssl-mode.mjs';

test('maps the pg-only no-verify alias to the libpq encrypted equivalent', () => {
  assert.equal(backupSslMode('no-verify'), 'require');
});
test('preserves certificate-verifying modes and unspecified configuration', () => {
  for (const value of ['verify-full', 'verify-ca', 'require', undefined, null]) {
    assert.equal(backupSslMode(value), value);
  }
});
