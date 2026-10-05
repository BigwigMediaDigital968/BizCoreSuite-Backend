export const LEAD_IMPORT_CONFIG = {
  maxFileSize: 5 * 1024 * 1024,

  maxRows: 5000,

  allowedExtensions: [
    ".xlsx",
    ".xls",
    ".csv",
  ],

  requiredColumns: [
    "name",
    "phone",
    "city",
    "email",
    "industry",
    "message",
  ],
} as const;