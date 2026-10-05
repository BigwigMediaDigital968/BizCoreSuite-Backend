import XLSX from "xlsx";

import { Lead, LEAD_SOURCE_TYPE } from "../models/Lead.js";
import { Branch } from "../models/Branch.js";
import { AppError } from "../utils/AppError.js";

import type {
  LeadImportError,
  LeadImportRow,
  ValidatedLeadImportRow,
} from "../types/leadImport.js";
import { LEAD_STATUS } from "../constants/leadStatus.js";
import mongoose from "mongoose";

export const parseLeadExcel = (buffer: Buffer): LeadImportRow[] => {
  if (!buffer.length) {
    throw new AppError("Uploaded file is empty", 400, "EMPTY_IMPORT_FILE");
  }

  const workbook = XLSX.read(buffer, {
    type: "buffer",
  });

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new AppError(
      "Excel file contains no worksheets",
      400,
      "EMPTY_WORKBOOK",
    );
  }

  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new AppError(
      "The first worksheet could not be read",
      400,
      "WORKSHEET_NOT_FOUND",
    );
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: false,
  });

  return rows.map((row) => {
    let rawCountryCode = String(
      row["phoneCountryCode"] ??
        row["Country Code"] ??            // ✅ Support Excel header "Country Code"
        row["Phone Country Code"] ??
        row["phone_country_code"] ??
        "",
    ).trim();

    // ✅ Automatically prepend '+' if the user entered numbers like "91"
    if (rawCountryCode && !rawCountryCode.startsWith("+")) {
      rawCountryCode = `+${rawCountryCode}`;
    }

    return {
      name: String(row["name"] ?? row["Name"] ?? "").trim(),

      phoneCountryCode: rawCountryCode,

      phone: String(row["phone"] ?? row["Phone"] ?? "").trim(),

      city: String(row["city"] ?? row["City"] ?? "").trim(),

      email: String(row["email"] ?? row["Email"] ?? "").trim(),

      industry: String(row["industry"] ?? row["Industry"] ?? "").trim(),

      message: String(row["message"] ?? row["Message"] ?? "").trim(),
    };
  });
};

const normalizePhone = (phone: string): string => {
  return phone
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "");
};

const isValidCountryCode = (countryCode: string): boolean => {
  return /^\+[1-9]\d{0,3}$/.test(countryCode);
};

const isValidPhone = (phone: string): boolean => {
  return /^\d{6,15}$/.test(phone);
};

const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const normalizeEmail = (email?: string): string | undefined => {
  if (!email) {
    return undefined;
  }

  const normalized = email.trim().toLowerCase();

  return normalized || undefined;
};

export const validateLeadImportRow = (
  row: LeadImportRow,
  rowNumber: number,
): {
  data?: LeadImportRow;
  errors: LeadImportError[];
} => {
  const errors: LeadImportError[] = [];

  let countryCode = row.phoneCountryCode.trim();

  // ✅ Additional check in case '+' was missed during row mapping
  if (countryCode && !countryCode.startsWith("+")) {
    countryCode = `+${countryCode}`;
  }

  const phone = row.phone.trim().replace(/\s+/g, "").replace(/-/g, "");

  const email = row.email?.trim().toLowerCase();

  if (!row.name.trim()) {
    errors.push({
      row: rowNumber,
      field: "name",
      message: "Name is required",
    });
  }

  if (!countryCode) {
    errors.push({
      row: rowNumber,
      field: "phoneCountryCode",
      message: "Phone country code is required",
    });
  } else if (!isValidCountryCode(countryCode)) {
    errors.push({
      row: rowNumber,
      field: "phoneCountryCode",
      value: countryCode,
      message: "Invalid phone country code",
    });
  }

  if (!phone) {
    errors.push({
      row: rowNumber,
      field: "phone",
      message: "Phone number is required",
    });
  } else if (!isValidPhone(phone)) {
    errors.push({
      row: rowNumber,
      field: "phone",
      value: phone,
      message: "Invalid phone number",
    });
  }

  if (email && !isValidEmail(email)) {
    errors.push({
      row: rowNumber,
      field: "email",
      value: email,
      message: "Invalid email address",
    });
  }

  if (errors.length > 0) {
    return {
      errors,
    };
  }

  return {
    errors: [],

    data: {
      name: row.name.trim(),

      phoneCountryCode: countryCode,

      phone,

      city: row.city?.trim() || undefined,

      email: email || undefined,

      industry: row.industry?.trim() || undefined,

      message: row.message?.trim() || undefined,
    },
  };
};

export const validateLeadImportRows = (rows: LeadImportRow[]) => {
  const validRows: ValidatedLeadImportRow[] = [];

  const errors: LeadImportError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    const result = validateLeadImportRow(row, rowNumber);

    if (result.data) {
      validRows.push({
        rowNumber,
        data: result.data,
      });
    }

    errors.push(...result.errors);
  });

  return {
    validRows,
    errors,
  };
};

const getPhoneKey = (countryCode: string, phone: string): string => {
  return `${countryCode}${phone}`;
};

export const findExistingLeadPhones = async (
  rows: ValidatedLeadImportRow[],
): Promise<Set<string>> => {
  if (!rows.length) {
    return new Set();
  }

  const phoneQueries = rows.map((row) => ({
    phoneCountryCode: row.data.phoneCountryCode,
    phone: row.data.phone,
  }));

  const leads = await Lead.find({
    $or: phoneQueries,
    isDeleted: false,
  })
    .select("phoneCountryCode phone")
    .lean();

  return new Set(
    leads.map((lead) => getPhoneKey(lead.phoneCountryCode, lead.phone)),
  );
};

export const filterDuplicateImportRows = (
  rows: ValidatedLeadImportRow[],
  existingPhones: Set<string>,
) => {
  const seenPhones = new Set<string>(existingPhones);

  const uniqueRows: ValidatedLeadImportRow[] = [];

  const duplicateRows: LeadImportError[] = [];

  for (const row of rows) {
    const phone = getPhoneKey(row.data.phoneCountryCode, row.data.phone);

    if (seenPhones.has(phone)) {
      duplicateRows.push({
        row: row.rowNumber,
        field: "phone",
        value: phone,
        message: "Lead already exists or is duplicated in the import file",
      });

      continue;
    }

    seenPhones.add(phone);

    uniqueRows.push(row);
  }

  return {
    uniqueRows,
    duplicateRows,
  };
};

export const importLeadsFromExcel = async ({
  buffer,
  branchId,
  createdBy,
}: {
  buffer: Buffer;
  branchId: string;
  createdBy: string;
}) => {
  const rows = parseLeadExcel(buffer);

  if (!rows.length) {
    throw new AppError(
      "No lead records found in the file",
      400,
      "NO_LEADS_FOUND",
    );
  }

  const { validRows, errors } = validateLeadImportRows(rows);

  const existingPhones = await findExistingLeadPhones(validRows);

  const { uniqueRows, duplicateRows } = filterDuplicateImportRows(
    validRows,
    existingPhones,
  );

  const branch = await Branch.findOne({
    _id: branchId,
    isActive: true,
  });

  if (!branch) {
    throw new AppError("Branch not found or inactive", 404, "BRANCH_NOT_FOUND");
  }

  const leadsToInsert = uniqueRows.map((row) => ({
    name: row.data.name,

    phoneCountryCode: row.data.phoneCountryCode,

    phone: row.data.phone,

    email: row.data.email,

    city: row.data.city,

    industry: row.data.industry,

    message: row.data.message,

    branch: new mongoose.Types.ObjectId(branchId),

    createdBy: new mongoose.Types.ObjectId(createdBy),

    status: LEAD_STATUS.NEW,

    source: "Excel Import",

    sourceType: LEAD_SOURCE_TYPE.EXCEL,

    isDeleted: false,
  }));

  let insertedCount = 0;

  if (leadsToInsert.length) {
    const inserted = await Lead.insertMany(leadsToInsert, {
      ordered: false,
    });

    insertedCount = inserted.length;
  }

  return {
    totalRows: rows.length,

    successful: insertedCount,

    duplicates: duplicateRows.length,

    failed: errors.length,

    errors: [...errors, ...duplicateRows],
  };
};