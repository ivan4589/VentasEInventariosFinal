export const ANALYTICS_REPORT_KEYS = [
  'inventory-valuation',
  'sales-detail',
  'collections',
  'accounts-receivable',
  'low-stock',
  'kardex',
  'purchases-by-provider',
  'sales-by-seller',
  'top-products',
  'warehouse-transfers',
  'estimated-profit',
  'returns-cancellations',
  'general-summary',
] as const;

export type AnalyticsReportKey = (typeof ANALYTICS_REPORT_KEYS)[number];

export type ReportValue = string | number | boolean | Date | null;
export type ReportFormat =
  'text' | 'number' | 'currency' | 'date' | 'datetime' | 'status';

export interface ReportColumn {
  key: string;
  label: string;
  format?: ReportFormat;
  align?: 'left' | 'center' | 'right';
}

export interface ReportMetric {
  label: string;
  value: ReportValue;
  format?: ReportFormat;
}

export interface ReportTable {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, ReportValue>>;
  totals?: Array<Record<string, ReportValue>>;
}

export interface ReportSection {
  title: string;
  subtitle?: string;
  metrics?: ReportMetric[];
  tables: ReportTable[];
}

export interface AnalyticsReportDocument {
  key: AnalyticsReportKey;
  title: string;
  description: string;
  generatedAt: Date;
  periodLabel?: string;
  metrics: ReportMetric[];
  sections: ReportSection[];
  emptyMessage: string;
}

export interface AnalyticsReportCatalogItem {
  key: AnalyticsReportKey;
  title: string;
  description: string;
  category: 'PRINCIPAL' | 'INVENTARIO' | 'VENTAS' | 'COBRANZA' | 'GESTION';
  adminOnly: boolean;
  requiresDateRange: boolean;
  defaultSaleStatus?: 'CONFIRMED';
}
