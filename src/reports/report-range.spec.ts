import { BadRequestException } from '@nestjs/common';
import { assertReportRange, protectSpreadsheetCell } from './report-range';

describe('report range security', () => {
  it('acepta rangos de hasta doce meses', () => {
    expect(() => assertReportRange('2026-01-01', '2026-12-31', { required: true })).not.toThrow();
  });

  it('rechaza rangos superiores a doce meses', () => {
    expect(() => assertReportRange('2025-01-01', '2026-02-01', { required: true })).toThrow(BadRequestException);
  });

  it('rechaza periodos incompletos cuando son obligatorios', () => {
    expect(() => assertReportRange('2026-01-01', undefined, { required: true })).toThrow(BadRequestException);
  });

  it('protege valores que Excel interpretaría como fórmula', () => {
    expect(protectSpreadsheetCell('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
    expect(protectSpreadsheetCell('Producto normal')).toBe('Producto normal');
  });
});
