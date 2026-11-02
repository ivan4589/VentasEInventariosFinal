import * as ExcelJS from 'exceljs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const excelRequire = createRequire(require.resolve('exceljs'));
const archiveRequire = createRequire(excelRequire.resolve('archiver'));
const normalize = (paths: string[]) => paths.map(path => path.split(sep).join('/')).sort();

describe('Excel dependency compatibility', () => {
  let directory: string;
  const prefix = join(tmpdir(), 'yungas-excel-compat-');

  beforeEach(async () => {
    directory = await mkdtemp(prefix);
    await mkdir(join(directory, 'nested'));
    await Promise.all([
      writeFile(join(directory, 'root.txt'), 'root fixture'),
      writeFile(join(directory, 'nested', 'sale.csv'), 'code,price\nP-001,0'),
      writeFile(join(directory, 'nested', 'skip.txt'), 'excluded fixture'),
      writeFile(join(directory, '.hidden.txt'), 'hidden fixture'),
    ]);
  });

  afterEach(async () => {
    // Only remove the exact temporary directory created by this test.
    if (directory && resolve(directory).startsWith(resolve(prefix))) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves legacy glob matching, exclusions and brace expansion', async () => {
    const utils = archiveRequire('archiver-utils');
    expect(normalize(utils.file.expand({ cwd: directory }, '**/*.{txt,csv}', '!**/skip.txt')))
      .toEqual(['nested/sale.csv', 'root.txt']);
    const rimrafRequire = createRequire(excelRequire.resolve('tmp'));
    const cleanupRequire = createRequire(rimrafRequire.resolve('rimraf'));
    const cleanupGlob = cleanupRequire('@yungas/legacy-glob-adapter');
    expect(normalize(cleanupGlob.sync('**/*.{txt,csv}', { cwd: directory, ignore: '**/skip.txt', nodir: true })))
      .toEqual(['nested/sale.csv', 'root.txt']);
    expect(cleanupGlob.hasMagic('file{1,2}.txt')).toBe(true);
    expect(cleanupGlob.hasMagic('plain.txt')).toBe(false);
    const files = await new Promise<string[]>((accept, reject) => {
      cleanupGlob('**/*.{txt,csv}', { cwd: directory, ignore: '**/skip.txt', nodir: true }, (error: Error | null, paths: string[]) => {
        if (error) reject(error);
        else accept(paths);
      });
    });
    expect(normalize(files)).toEqual(['nested/sale.csv', 'root.txt']);
  });

  it('reports matcher failures to legacy callbacks', async () => {
    const legacy = require('@yungas/legacy-glob-adapter');
    const error = await new Promise<unknown>(accept => legacy(null, {}, (failure: unknown) => accept(failure)));
    expect(error).toBeInstanceOf(Error);
  });

  it('keeps actual rimraf callback and sync consumers compatible without deleting files', async () => {
    const unzipRequire = createRequire(excelRequire.resolve('unzipper'));
    const fstreamRequire = createRequire(unzipRequire.resolve('fstream'));
    const rimraf = fstreamRequire('rimraf');
    const pattern = '**/*.{txt,csv}';
    const matches: string[] = [];
    const missing = Object.assign(new Error('fixture pattern'), { code: 'ENOENT' });
    const stats = { isDirectory: () => false };
    const options = {
      glob: { cwd: directory, ignore: '**/skip.txt', nodir: true },
      lstat: (file: string, callback: (error: Error | null, value?: typeof stats) => void) => file === pattern ? callback(missing) : callback(null, stats),
      unlink: (file: string, callback: (error: null) => void) => { matches.push(file); callback(null); },
      lstatSync: (file: string) => { if (file === pattern) throw missing; return stats; },
      unlinkSync: (file: string) => matches.push(file),
    };
    await new Promise<void>((accept, reject) => rimraf(pattern, options, (error?: Error) => error ? reject(error) : accept()));
    expect(normalize(matches)).toEqual(['nested/sale.csv', 'root.txt']);
    matches.length = 0;
    rimraf.sync(pattern, options);
    expect(normalize(matches)).toEqual(['nested/sale.csv', 'root.txt']);
  });

  it('validates postinstall adaptation without rewriting already-adapted modules', () => {
    const root = resolve(__dirname, '../..');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = spawnSync(process.execPath, [join(root, 'scripts/patch-excel-glob.cjs')], { cwd: root, encoding: 'utf8' });
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('adapted 0 imports');
    }
  });

  it('creates a readable ZIP using the real archiver filesystem glob', async () => {
    const archive = excelRequire('archiver')('zip');
    const chunks: Buffer[] = [];
    const complete = new Promise<Buffer>((accept, reject) => {
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('error', reject);
      archive.on('warning', reject);
      archive.on('end', () => accept(Buffer.concat(chunks)));
    });
    archive.glob('**/*.{txt,csv}', { cwd: directory, ignore: '**/skip.txt' });
    await archive.finalize();
    const zip = await excelRequire('jszip').loadAsync(await complete);
    expect(Object.keys(zip.files).filter(name => !zip.files[name].dir).sort())
      .toEqual(['nested/sale.csv', 'root.txt']);
    expect(await zip.file('nested/sale.csv').async('string')).toContain('P-001,0');
  });

  it('round-trips accented names, codes, zero prices and formulas', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Clientes y productos');
    sheet.addRow(['Código', 'Nombre', 'Precio', 'Cantidad', 'Subtotal']);
    sheet.addRow(['P-001', 'Distribución Yungas', 0, 2, { formula: 'D2+1', result: 3 }]);
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
    expect(reopened.worksheets[0].getRow(2).values).toEqual([
      undefined, 'P-001', 'Distribución Yungas', 0, 2, { formula: 'D2+1', result: 3 },
    ]);
  });

  it('keeps the streaming XLSX writer compatible with archiver', async () => {
    const writer = new ExcelJS.stream.xlsx.WorkbookWriter({ useSharedStrings: true });
    const sheet = writer.addWorksheet('Productos');
    sheet.addRow(['P-001', 'Producto de prueba', 12.5]).commit();
    sheet.commit();
    await writer.commit();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(writer.stream.read() as any);
    expect(reopened.worksheets[0].getRow(1).getCell(1).value).toBe('P-001');
    expect(reopened.worksheets[0].getRow(1).getCell(3).value).toBe(12.5);
  });
});
