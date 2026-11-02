'use strict';

// Run inside the production image: no database, credentials or client data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ExcelJS = require('exceljs');
const root = path.resolve(__dirname, '..');
const excelRequire = createRequire(require.resolve('exceljs'));
const archiveRequire = createRequire(excelRequire.resolve('archiver'));
const zipRequire = createRequire(archiveRequire.resolve('zip-stream'));
const unzipRequire = createRequire(excelRequire.resolve('unzipper'));
const fstreamRequire = createRequire(unzipRequire.resolve('fstream'));

(async () => {
  for (const [dependencyRequire, name, filename] of [
    [archiveRequire, 'archiver-utils', 'file.js'],
    [zipRequire, 'archiver-utils', 'file.js'],
    [fstreamRequire, 'rimraf', 'rimraf.js'],
  ]) {
    const manifest = dependencyRequire.resolve(name + '/package.json');
    const source = fs.readFileSync(path.join(path.dirname(manifest), filename), 'utf8');
    assert.ok(source.includes("require('@yungas/legacy-glob-adapter')"));
  }
  const adapter = require('@yungas/legacy-glob-adapter');
  assert.equal(typeof adapter, 'function');
  assert.equal(adapter.hasMagic('file{1,2}.txt'), true);
  assert.ok(adapter.sync('*.json', { cwd: root }).includes('package.json'));
  assert.ok(archiveRequire('archiver-utils').file.expand({ cwd: root }, '*.json').includes('package.json'));
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Prueba').addRow(['P-001', 'Producto', 0]);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(reopened.worksheets[0].getCell('A1').value, 'P-001');
  assert.equal(reopened.worksheets[0].getCell('C1').value, 0);
  assert.ok(fs.existsSync(path.join(root, 'dist/src/main.js')));
  assert.ok(fs.existsSync(path.join(root, 'prisma/migrations/20261102090000_secure_client_contacts/migration.sql')));
  console.log(JSON.stringify({ productionImage: 'verified', excelRoundTrip: true, legacyConsumers: 'adapted', migrationIncluded: true }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
