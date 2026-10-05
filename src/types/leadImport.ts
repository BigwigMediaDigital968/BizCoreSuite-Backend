export interface LeadImportRow {
  name: string;
  phoneCountryCode: string;
  phone: string;
  city?: string;
  email?: string;
  industry?: string;
  message?: string;
}

export interface LeadImportError {
  row: number;
  field?: string;
  value?: unknown;
  message: string;
}

export interface ValidatedLeadImportRow {
  rowNumber: number;
  data: LeadImportRow;
}

export interface LeadImportResult {
  totalRows: number;
  successful: number;
  duplicates: number;
  failed: number;
  errors: LeadImportError[];
}