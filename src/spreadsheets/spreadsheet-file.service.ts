import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { protectSpreadsheetCell } from '../reports/report-range';
import {
  ParsedSpreadsheetRow,
  SpreadsheetImportAction,
  SpreadsheetImportPreview,
  SpreadsheetPreviewRow,
} from './spreadsheet.types';

const MAX_IMPORT_ROWS = 1000;

@Injectable()
export class SpreadsheetFileService {
  async readRows(
    contents: Buffer,
    sheetName: string,
    expectedHeaders: readonly string[],
  ): Promise<ParsedSpreadsheetRow[]> {
    const workbook = new ExcelJS.Workbook();

    try {
      await workbook.xlsx.load(contents as any);
    } catch {
      throw new BadRequestException(
        'El archivo no es un Excel .xlsx válido o está dañado',
      );
    }

    const worksheet =
      workbook.getWorksheet(sheetName) || workbook.worksheets[0];

    if (!worksheet) {
      throw new BadRequestException('El archivo Excel no contiene hojas');
    }

    const actualHeaders = expectedHeaders.map((_, index) =>
      this.cellText(worksheet.getRow(1).getCell(index + 1)).toUpperCase(),
    );
    const missing = expectedHeaders.filter(
      (header, index) => actualHeaders[index] !== header,
    );

    if (missing.length) {
      throw new BadRequestException(
        `La hoja debe conservar las columnas de la plantilla. Columnas inválidas o ausentes: ${missing.join(', ')}`,
      );
    }

    const rows: ParsedSpreadsheetRow[] = [];
    const lastRow = Math.min(worksheet.actualRowCount, MAX_IMPORT_ROWS + 1);

    for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const values = Object.fromEntries(
        expectedHeaders.map((header, index) => [
          header,
          this.cellText(row.getCell(index + 1)),
        ]),
      );

      if (Object.values(values).some((value) => value !== '')) {
        rows.push({ row: rowNumber, values });
      }
    }

    if (worksheet.actualRowCount > MAX_IMPORT_ROWS + 1) {
      throw new BadRequestException(
        `El archivo supera el máximo de ${MAX_IMPORT_ROWS} filas por importación`,
      );
    }

    if (!rows.length) {
      throw new BadRequestException(
        'El archivo no contiene filas para importar',
      );
    }

    return rows;
  }

  createWorkbook(
    dataSheetName: string,
    headers: readonly string[],
    widths: readonly number[],
    rows: unknown[][],
  ) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Yungas Distribuidora';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet(dataSheetName, {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    worksheet.columns = headers.map((header, index) => ({
      header,
      key: header,
      width: widths[index] || 18,
    }));

    rows.forEach((values) => {
      worksheet.addRow(values.map((value) => protectSpreadsheetCell(value)));
    });

    this.styleDataSheet(worksheet, headers.length);
    return { workbook, worksheet };
  }

  addCatalogSheet(
    workbook: ExcelJS.Workbook,
    columns: Array<{ header: string; values: string[]; width?: number }>,
  ) {
    const worksheet = workbook.addWorksheet('Catalogos', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });

    worksheet.columns = columns.map((column) => ({
      header: column.header,
      width: column.width || 28,
    }));
    const maximum = Math.max(
      0,
      ...columns.map((column) => column.values.length),
    );

    for (let index = 0; index < maximum; index += 1) {
      worksheet.addRow(
        columns.map((column) =>
          protectSpreadsheetCell(column.values[index] || ''),
        ),
      );
    }

    this.styleDataSheet(worksheet, columns.length);
    return worksheet;
  }

  addInstructionsSheet(workbook: ExcelJS.Workbook, instructions: string[]) {
    const worksheet = workbook.addWorksheet('Instrucciones', {
      views: [{ showGridLines: false }],
    });
    worksheet.columns = [{ width: 110 }];
    worksheet.getCell('A1').value = 'IMPORTACIÓN MASIVA — INSTRUCCIONES';
    worksheet.getCell('A1').font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      size: 15,
    };
    worksheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF005B3F' },
    };
    worksheet.getCell('A1').alignment = { vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    instructions.forEach((instruction, index) => {
      const cell = worksheet.getCell(index + 3, 1);
      cell.value = `${index + 1}. ${instruction}`;
      cell.alignment = { wrapText: true, vertical: 'top' };
      worksheet.getRow(index + 3).height = 34;
    });
    return worksheet;
  }

  applyListValidation(
    worksheet: ExcelJS.Worksheet,
    columnNumber: number,
    formula: string,
  ) {
    for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row += 1) {
      worksheet.getCell(row, columnNumber).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: 'Valor no válido',
        error: 'Selecciona un valor de la lista.',
      };
    }
  }

  async toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  buildPreview(rows: SpreadsheetPreviewRow[]): SpreadsheetImportPreview {
    const count = (action: SpreadsheetImportAction) =>
      rows.filter((row) => row.errors.length === 0 && row.action === action)
        .length;
    const errors = rows.filter((row) => row.errors.length > 0).length;

    return {
      valid: errors === 0,
      summary: {
        totalRows: rows.length,
        created: count('CREATE'),
        updated: count('UPDATE'),
        unchanged: count('UNCHANGED'),
        errors,
      },
      rows,
    };
  }

  isDeleteMarker(value: string) {
    return value.trim().toUpperCase() === 'BORRAR';
  }

  requiredText(value: string, field: string, errors: string[]) {
    const normalized = value.trim();
    if (!normalized || this.isDeleteMarker(normalized)) {
      errors.push(`${field} es obligatorio`);
      return undefined;
    }
    return normalized;
  }

  optionalText(value: string): string | null | undefined {
    if (!value.trim()) return undefined;
    if (this.isDeleteMarker(value)) return null;
    return value.trim();
  }

  number(
    value: string,
    field: string,
    errors: string[],
    options: { required?: boolean; integer?: boolean; nullable?: boolean } = {},
  ): number | null | undefined {
    if (!value.trim()) {
      if (options.required) errors.push(`${field} es obligatorio`);
      return undefined;
    }
    if (this.isDeleteMarker(value)) {
      if (options.nullable) return null;
      errors.push(`${field} no se puede borrar`);
      return undefined;
    }

    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.push(`${field} debe ser un número mayor o igual a cero`);
      return undefined;
    }
    if (options.integer && !Number.isInteger(parsed)) {
      errors.push(`${field} debe ser un número entero`);
      return undefined;
    }
    return parsed;
  }

  boolean(
    value: string,
    field: string,
    errors: string[],
    required = false,
  ): boolean | undefined {
    if (!value.trim()) {
      if (required) errors.push(`${field} es obligatorio`);
      return undefined;
    }
    const normalized = value.trim().toUpperCase();
    if (['SI', 'SÍ', 'TRUE', '1'].includes(normalized)) return true;
    if (['NO', 'FALSE', '0'].includes(normalized)) return false;
    errors.push(`${field} debe ser SI o NO`);
    return undefined;
  }

  private cellText(cell: ExcelJS.Cell): string {
    const value = cell.value;
    if (value === null || value === undefined) return '';
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value).trim();
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if ('result' in value) {
        const result: unknown = value.result;
        if (
          typeof result === 'string' ||
          typeof result === 'number' ||
          typeof result === 'boolean'
        ) {
          return String(result).trim();
        }
        if (result instanceof Date) return result.toISOString();
        return '';
      }
      if ('richText' in value) {
        return value.richText
          .map((part) => part.text)
          .join('')
          .trim();
      }
    }
    return '';
  }

  private styleDataSheet(worksheet: ExcelJS.Worksheet, columnCount: number) {
    const header = worksheet.getRow(1);
    header.height = 28;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF005B3F' },
    };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columnCount },
    };

    for (let row = 2; row <= worksheet.actualRowCount; row += 1) {
      worksheet.getRow(row).alignment = { vertical: 'top' };
      if (row % 2 === 0) {
        worksheet.getRow(row).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F7F5' },
        };
      }
    }
  }
}
