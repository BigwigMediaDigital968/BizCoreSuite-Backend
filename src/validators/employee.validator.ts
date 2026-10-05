import { z } from "zod";

import {
  EMPLOYMENT_STATUS,
  EMPLOYMENT_TYPES,
  GENDER,
} from "../constants/employee.js";

const profileImageValidation = z
  .object({
    url: z.string().url("Invalid image URL"),
    publicId: z.string().optional(),
    uploadedAt: z.coerce.date().optional(),
  })
  .optional();

const salarySchema = z.object({
  basic: z.number().min(0).default(0),
  hra: z.number().min(0).default(0),
  conveyance: z.number().min(0).default(0),
  medicalAllowance: z.number().min(0).default(0),
  specialAllowance: z.number().min(0).default(0),
  otherAllowance: z.number().min(0).default(0),

  grossSalary: z.number().min(0),

  pfDeduction: z.number().min(0).default(0),
  esiDeduction: z.number().min(0).default(0),
  professionalTax: z.number().min(0).default(0),
  otherDeduction: z.number().min(0).default(0),

  netSalary: z.number().min(0),
});

const bankDetailsSchema = z
  .object({
    accountHolderName: z.string().trim().max(150).optional(),

    accountNumber: z.string().trim().max(50).optional(),

    ifscCode: z.string().trim().max(20).optional(),

    bankName: z.string().trim().max(150).optional(),

    branchName: z.string().trim().max(150).optional(),
  })
  .optional();

const documentSchema = z.object({
  documentType: z.string().trim().min(1).max(100),

  documentNumber: z.string().trim().max(100).optional(),

  documentUrl: z.string().url(),

  publicId: z.string().optional(),

  uploadedAt: z.coerce.date().default(() => new Date()),
});

export const createEmployeeProfileSchema = z.object({
  userId: z.string().min(1),

  employeeCode: z.string().trim().min(2).max(30),

  profileImage: profileImageValidation,

  branchId: z.string().min(1),

  reportingManager: z.string().min(1).optional(),

  designation: z.string().trim().max(150).optional(),

  department: z.string().trim().max(150).optional(),

  employmentType: z.nativeEnum(EMPLOYMENT_TYPES),
  employmentStatus: z.nativeEnum(EMPLOYMENT_STATUS).optional(),

  joiningDate: z.coerce.date(),
  probationEndDate: z.coerce.date().optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.nativeEnum(GENDER).optional(),

  personalPhone: z.string().trim().max(20).optional(),

  alternatePhone: z.string().trim().max(20).optional(),

  address: z.string().trim().max(500).optional(),

  city: z.string().trim().max(100).optional(),

  state: z.string().trim().max(100).optional(),

  country: z.string().trim().max(100).optional(),

  postalCode: z.string().trim().max(20).optional(),

  emergencyContactName: z.string().trim().max(150).optional(),

  emergencyContactPhone: z.string().trim().max(20).optional(),

  emergencyContactRelation: z.string().trim().max(100).optional(),

  documents: z.array(documentSchema).optional(),

  salary: salarySchema,

  bankDetails: bankDetailsSchema,

  notes: z.string().trim().max(3000).optional(),
});

export const updateEmployeeProfileSchema = createEmployeeProfileSchema
  .omit({
    userId: true,
    employeeCode: true,
  })
  .partial()
  .extend({
    employeeCode: z.string().trim().min(2).max(30).optional(),
  });

// export const employeeListQuerySchema = z.object({
//   page: z.coerce.number().int().min(1).default(1),

//   limit: z.coerce.number().int().min(1).max(100).default(20),

//   branchId: z.string().optional(),

//   // Add reportingManager to allow manager-scoped queries
//   reportingManager: z.string().optional(),

//   // Add role if you filter accounts by ROLES (e.g. ROLES.EMPLOYEE)
//   role: z.string().optional(),

//   status: z
//     .enum(Object.values(EMPLOYMENT_STATUS) as [string, ...string[]])
//     .optional(),

//   search: z.string().trim().max(100).optional(),
// });

export const employeeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  // Accept a single string or an array of branch IDs
  branchId: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => {
      // Handles comma-separated string formats (e.g., "id1,id2") by converting to an array
      if (typeof val === "string" && val.includes(",")) {
        return val.split(",").map((id) => id.trim());
      }
      return val;
    })
    .optional(),

  reportingManager: z.string().optional(),

  role: z.string().optional(),

  // status: z
  //   .enum(Object.values(EMPLOYMENT_STATUS) as [string, ...string[]])
  //   .optional(),
  status: z.nativeEnum(EMPLOYMENT_STATUS).optional(),

  search: z.string().trim().max(100).optional(),
});
