'use strict';

// Version-checked API adaptation, not an advisory suppression. All matching
// and traversal is performed by official glob 14 through our small adapter.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const rootRequire = createRequire(path.join(root, 'package.json'));
const excelRequire = createRequire(rootRequire.resolve('exceljs'));
const archiveRequire = createRequire(excelRequire.resolve('archiver'));
const zipRequire = createRequire(archiveRequire.resolve('zip-stream'));
const unzipRequire = createRequire(excelRequire.resolve('unzipper'));
const fstreamRequire = createRequire(unzipRequire.resolve('fstream'));
const modulesRoot = fs.realpathSync(path.join(root, 'node_modules')) + path.sep;
const targets = [
  [archiveRequire, 'archiver-utils', '2.1.0', 'file.js', "require('glob')"],
  [zipRequire, 'archiver-utils', '3.0.4', 'file.js', "require('glob')"],
  [fstreamRequire, 'rimraf', '2.7.1', 'rimraf.js', 'require("glob")'],
];
const replacement = "require('@yungas/legacy-glob-adapter')";
const writes = [];

for (const [dependencyRequire, name, version, filename, original] of targets) {
  const manifestPath = dependencyRequire.resolve(name + '/package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== version) {
    throw new Error('Review Excel glob compatibility for ' + name + '@' + manifest.version);
  }
  const target = fs.realpathSync(path.join(path.dirname(manifestPath), filename));
  if (!target.startsWith(modulesRoot)) throw new Error('Refusing to modify a module outside this installation');
  const source = fs.readFileSync(target, 'utf8');
  if (!source.includes(original) && source.split(replacement).length === 2) continue;
  if (source.split(original).length !== 2 || source.includes(replacement)) {
    throw new Error('Unexpected glob import in ' + name + '/' + filename);
  }
  writes.push([target, source.replace(original, replacement)]);
}

// Validate every target before writing any adaptation. Re-running is safe.
for (const [target, source] of writes) fs.writeFileSync(target, source);
console.log('[excel-glob] validated legacy consumers; adapted ' + writes.length + ' imports');
