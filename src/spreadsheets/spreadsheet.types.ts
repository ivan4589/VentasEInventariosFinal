export type SpreadsheetImportAction = 'CREATE' | 'UPDATE' | 'UNCHANGED';

export interface SpreadsheetPreviewRow {
  row: number;
  action: SpreadsheetImportAction;
  identifier: string;
  displayName: string;
  errors: string[];
}

export interface SpreadsheetImportSummary {
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
}

export interface SpreadsheetImportPreview {
  valid: boolean;
  summary: SpreadsheetImportSummary;
  rows: SpreadsheetPreviewRow[];
}

export interface ParsedSpreadsheetRow {
  row: number;
  values: Record<string, string>;
}

export interface PreparedSpreadsheetImport<T> extends SpreadsheetImportPreview {
  prepared: T[];
}
