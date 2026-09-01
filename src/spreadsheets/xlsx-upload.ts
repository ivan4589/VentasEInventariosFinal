import { BadRequestException } from '@nestjs/common';

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

export const xlsxUploadOptions = {
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _request: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const extensionIsValid = file.originalname.toLowerCase().endsWith('.xlsx');
    if (!extensionIsValid || !XLSX_MIME_TYPES.has(file.mimetype)) {
      callback(
        new BadRequestException('Solo se permiten archivos Excel .xlsx'),
        false,
      );
      return;
    }
    callback(null, true);
  },
};

export function requireXlsxFile(file?: Express.Multer.File) {
  if (!file) {
    throw new BadRequestException('Debes seleccionar un archivo Excel .xlsx');
  }
  return file;
}
