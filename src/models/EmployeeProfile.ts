import mongoose, { Document, Schema, Types } from "mongoose";
import type { ILeaveBalance } from "./LeaveBalance.js";

import {
  EMPLOYMENT_STATUS,
  EMPLOYMENT_TYPES,
  GENDER,
  type EmploymentStatus,
  type EmploymentType,
  type Gender,
} from "../constants/employee.js";

export interface IProfileImage {
  url: string;
  publicId?: string;
  uploadedAt?: Date;
}

export interface IEmployeeDocument {
  documentType: string;
  documentNumber?: string;
  documentUrl: string;
  publicId?: string;
  uploadedAt?: Date;
}

export interface ISalaryStructure {
  basic: number;
  hra: number;
  conveyance: number;
  medicalAllowance: number;
  specialAllowance: number;
  otherAllowance: number;
  grossSalary: number;
  pfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  otherDeduction: number;
  netSalary: number;
}

export interface IBankDetails {
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  branchName?: string;
}

export interface IEmployeeProfile extends Document {
  user: Types.ObjectId;

  profileImage?: IProfileImage;

  employeeCode: string;

  branch: Types.ObjectId;

  reportingManager?: Types.ObjectId;

  designation?: string;

  department?: string;

  employmentType: EmploymentType;

  employmentStatus: EmploymentStatus;

  joiningDate: Date;

  probationEndDate?: Date;

  dateOfBirth?: Date;

  gender?: Gender;

  personalPhone?: string;

  alternatePhone?: string;

  address?: string;

  city?: string;

  state?: string;

  country: string;

  postalCode?: string;

  emergencyContactName?: string;

  emergencyContactPhone?: string;

  emergencyContactRelation?: string;

  documents: IEmployeeDocument[];

  salary: ISalaryStructure;

  bankDetails?: IBankDetails;

  notes?: string;

  leaveBalances?: ILeaveBalance[];

  createdBy: Types.ObjectId;

  updatedBy?: Types.ObjectId;

  createdAt: Date;

  updatedAt: Date;
}

const employeeDocumentSchema = new Schema<IEmployeeDocument>(
  {
    documentType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    documentNumber: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    documentUrl: {
      type: String,
      required: true,
      trim: true,
    },

    publicId: {
      type: String,
      trim: true,
    },

    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
  },
);

const salarySchema = new Schema<ISalaryStructure>(
  {
    basic: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    hra: {
      type: Number,
      min: 0,
      default: 0,
    },

    conveyance: {
      type: Number,
      min: 0,
      default: 0,
    },

    medicalAllowance: {
      type: Number,
      min: 0,
      default: 0,
    },

    specialAllowance: {
      type: Number,
      min: 0,
      default: 0,
    },

    otherAllowance: {
      type: Number,
      min: 0,
      default: 0,
    },

    grossSalary: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    pfDeduction: {
      type: Number,
      min: 0,
      default: 0,
    },

    esiDeduction: {
      type: Number,
      min: 0,
      default: 0,
    },

    professionalTax: {
      type: Number,
      min: 0,
      default: 0,
    },

    otherDeduction: {
      type: Number,
      min: 0,
      default: 0,
    },

    netSalary: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    _id: false,
  },
);

const bankDetailsSchema = new Schema<IBankDetails>(
  {
    accountHolderName: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    accountNumber: {
      type: String,
      trim: true,
      maxlength: 50,
    },

    ifscCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },

    bankName: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    branchName: {
      type: String,
      trim: true,
      maxlength: 150,
    },
  },
  {
    _id: false,
  },
);

const profileImageSchema = new Schema<IProfileImage>(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    publicId: {
      type: String,
      trim: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  },
);

const employeeProfileSchema = new Schema<IEmployeeProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    profileImage: {
      type: profileImageSchema, // <-- ADD THIS FIELD TO SCHEMA
      default: null,
    },

    employeeCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
      minlength: 2,
      maxlength: 30,
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    reportingManager: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    designation: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    department: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    employmentType: {
      type: String,
      enum: Object.values(EMPLOYMENT_TYPES),
      required: true,
      default: EMPLOYMENT_TYPES.FULL_TIME,
      index: true,
    },

    employmentStatus: {
      type: String,
      enum: Object.values(EMPLOYMENT_STATUS),
      required: true,
      default: EMPLOYMENT_STATUS.ACTIVE,
      index: true,
    },

    joiningDate: {
      type: Date,
      required: true,
    },

    probationEndDate: {
      type: Date,
    },

    dateOfBirth: {
      type: Date,
    },

    gender: {
      type: String,
      enum: Object.values(GENDER),
    },

    personalPhone: {
      type: String,
      trim: true,
      maxlength: 20,
    },

    alternatePhone: {
      type: String,
      trim: true,
      maxlength: 20,
    },

    address: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    city: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    state: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    country: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "India",
    },

    postalCode: {
      type: String,
      trim: true,
      maxlength: 20,
    },

    emergencyContactName: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    emergencyContactPhone: {
      type: String,
      trim: true,
      maxlength: 20,
    },

    emergencyContactRelation: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    documents: {
      type: [employeeDocumentSchema],
      default: [],
    },

    salary: {
      type: salarySchema,
      required: true,
    },

    bankDetails: {
      type: bankDetailsSchema,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 3000,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },

    toObject: {
      virtuals: true,
    },
  },
);

employeeProfileSchema.index({
  branch: 1,
  employmentStatus: 1,
});

employeeProfileSchema.index({
  branch: 1,
  reportingManager: 1,
});

employeeProfileSchema.index({
  joiningDate: -1,
});

employeeProfileSchema.virtual("leaveBalances", {
  ref: "LeaveBalance",
  localField: "user",
  foreignField: "employee",
  justOne: false,
});

export const EmployeeProfile = mongoose.model<IEmployeeProfile>(
  "EmployeeProfile",
  employeeProfileSchema,
);
