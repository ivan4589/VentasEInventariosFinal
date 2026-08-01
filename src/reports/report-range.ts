import { BadRequestException } from '@nestjs/common';

interface ReportRangeOptions {
  required?: boolean;
}

export function assertReportRange(
  dateFrom?: string,
  dateTo?: string,
  options: ReportRangeOptions = {},
) {
  if (options.required && (!dateFrom || !dateTo)) {
    throw new BadRequestException(
      'Debes indicar la fecha inicial y la fecha final del reporte',
    );
  }

  if (!dateFrom && !dateTo) return;

  const from = dateFrom ? new Date(dateFrom) : undefined;
  const to = dateTo ? new Date(dateTo) : undefined;

  if (
    (from && Number.isNaN(from.getTime())) ||
    (to && Number.isNaN(to.getTime()))
  ) {
    throw new BadRequestException('El rango de fechas no es válido');
  }

  if (from && to) {
    if (from > to) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final',
      );
    }

    const maximum = new Date(from);
    maximum.setUTCFullYear(maximum.getUTCFullYear() + 1);
    maximum.setUTCDate(maximum.getUTCDate() + 1);

    if (to >= maximum) {
      throw new BadRequestException(
        'El rango máximo permitido para un reporte es de 12 meses',
      );
    }
  }
}

export function protectSpreadsheetCell(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trimStart();
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${value}`;
  }
  return value;
}
