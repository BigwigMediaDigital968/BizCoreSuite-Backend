import { Types } from "mongoose";

import {
  type EmploymentStatus,
  type EmploymentType,
  type Gender,
} from "../constants/employee.js";

import {
  EmployeeProfile,
  IProfileImage,
  type IEmployeeDocument,
  type ISalaryStructure,
} from "../models/EmployeeProfile.js";

import { User } from "../models/User.js";

import { Branch } from "../models/Branch.js";

import { ROLES, type Role } from "../constants/roles.js";

import { AppError } from "../utils/AppError.js";

interface CreateEmployeeInput {
  userId: string;
  employeeCode: string;
  profileImage?: IProfileImage;
  branchId: string;
  reportingManager?: string;
  designation?: string;
  department?: string;
  employmentType: EmploymentType; // Fixed: string -> EmploymentType
  employmentStatus?: EmploymentStatus; // Fixed: string | undefined -> EmploymentStatus | undefined
  joiningDate: Date;
  probationEndDate?: Date;
  dateOfBirth?: Date;
  gender?: Gender; // Fixed: string | undefined -> Gender | undefined
  personalPhone?: string;
  alternatePhone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  documents?: IEmployeeDocument[];
  salary: Record<string, number>;
  bankDetails?: Record<string, string>;
  notes?: string;
}

export interface UpdateEmployeeInput {
  employeeCode?: string;
  profileImage?: IProfileImage | null;
  branchId?: string;
  reportingManager?: string;
  designation?: string;
  department?: string;
  employmentType?: EmploymentType;
  employmentStatus?: EmploymentStatus;
  joiningDate?: Date;
  probationEndDate?: Date;
  dateOfBirth?: Date;
  gender?: Gender;
  personalPhone?: string;
  alternatePhone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  documents?: IEmployeeDocument[];
  salary?: Partial<ISalaryStructure>;
  bankDetails?: Record<string, string>;
  notes?: string;
}

interface AccessContext {
  userId: string;
  role: Role;
  branches: string[];
}

const assertBranchAccess = (branchId: string, context: AccessContext) => {
  if (context.role === ROLES.HEAD) {
    return;
  }

  if (!context.branches.includes(branchId)) {
    throw new AppError(
      "You do not have access to this branch",
      403,
      "BRANCH_ACCESS_DENIED",
    );
  }
};

export const createEmployeeProfile = async (
  data: CreateEmployeeInput,
  context: AccessContext,
) => {
  assertBranchAccess(data.branchId, context);

  const user = await User.findById(data.userId);

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  if (!user.isActive) {
    throw new AppError(
      "Cannot create employee profile for inactive user",
      400,
      "USER_INACTIVE",
    );
  }

  const branch = await Branch.findById(data.branchId);

  if (!branch || !branch.isActive) {
    throw new AppError("Branch not found or inactive", 404, "BRANCH_NOT_FOUND");
  }

  const existingProfile = await EmployeeProfile.findOne({
    user: data.userId,
  });

  if (existingProfile) {
    throw new AppError(
      "Employee profile already exists",
      409,
      "EMPLOYEE_PROFILE_EXISTS",
    );
  }

  const existingCode = await EmployeeProfile.findOne({
    employeeCode: data.employeeCode.toUpperCase(),
  });

  if (existingCode) {
    throw new AppError(
      "Employee code already exists",
      409,
      "EMPLOYEE_CODE_EXISTS",
    );
  }

  if (data.reportingManager) {
    const manager = await User.findById(data.reportingManager);

    if (!manager) {
      throw new AppError(
        "Reporting manager not found",
        404,
        "MANAGER_NOT_FOUND",
      );
    }

    if (manager.role !== ROLES.MANAGER) {
      throw new AppError(
        "Reporting manager must have manager role",
        400,
        "INVALID_REPORTING_MANAGER",
      );
    }

    const managerHasBranch = manager.branches.some(
      (id) => id.toString() === data.branchId,
    );

    if (!managerHasBranch) {
      throw new AppError(
        "Reporting manager does not belong to this branch",
        400,
        "MANAGER_BRANCH_MISMATCH",
      );
    }
  }

  const employee = await EmployeeProfile.create({
    user: new Types.ObjectId(data.userId),

    employeeCode: data.employeeCode.toUpperCase(),

    profileImage: data.profileImage,

    branch: new Types.ObjectId(data.branchId),

    reportingManager: data.reportingManager
      ? new Types.ObjectId(data.reportingManager)
      : undefined,

    designation: data.designation,

    department: data.department,

    employmentType: data.employmentType,

    employmentStatus: data.employmentStatus ?? "active",

    joiningDate: data.joiningDate,

    probationEndDate: data.probationEndDate,

    dateOfBirth: data.dateOfBirth,

    gender: data.gender,

    personalPhone: data.personalPhone,

    alternatePhone: data.alternatePhone,

    address: data.address,

    city: data.city,

    state: data.state,

    country: data.country ?? "India",

    postalCode: data.postalCode,

    emergencyContactName: data.emergencyContactName,

    emergencyContactPhone: data.emergencyContactPhone,

    emergencyContactRelation: data.emergencyContactRelation,

    documents: data.documents ?? [],

    salary: data.salary,

    bankDetails: data.bankDetails,

    notes: data.notes,

    createdBy: new Types.ObjectId(context.userId),
  });

  return employee;
};

export const updateEmployeeProfile = async (
  employeeId: string,
  data: UpdateEmployeeInput,
  context: AccessContext,
) => {
  // 1. Fetch existing profile
  const employee = await EmployeeProfile.findById(employeeId);

  if (!employee) {
    throw new AppError("Employee profile not found", 404, "EMPLOYEE_NOT_FOUND");
  }

  // 2. Access control check on the existing employee's branch
  assertBranchAccess(employee.branch.toString(), context);

  // 3. Prevent standard employees from updating other profiles or critical fields
  if (
    context.role === ROLES.EMPLOYEE &&
    employee.user.toString() !== context.userId
  ) {
    throw new AppError(
      "You can only update your own employee profile",
      403,
      "EMPLOYEE_ACCESS_DENIED",
    );
  }

  // 4. Validate branch update (if changing branch)
  let targetBranchId = employee.branch.toString();
  if (data.branchId && data.branchId !== targetBranchId) {
    assertBranchAccess(data.branchId, context);

    const branch = await Branch.findById(data.branchId);
    if (!branch || !branch.isActive) {
      throw new AppError(
        "Target branch not found or inactive",
        404,
        "BRANCH_NOT_FOUND",
      );
    }
    targetBranchId = data.branchId;
    employee.branch = new Types.ObjectId(data.branchId);
  }

  // 5. Validate unique employee code (if updating)
  if (
    data.employeeCode &&
    data.employeeCode.toUpperCase() !== employee.employeeCode
  ) {
    const existingCode = await EmployeeProfile.findOne({
      employeeCode: data.employeeCode.toUpperCase(),
      _id: { $ne: employeeId },
    });

    if (existingCode) {
      throw new AppError(
        "Employee code already exists",
        409,
        "EMPLOYEE_CODE_EXISTS",
      );
    }
    employee.employeeCode = data.employeeCode.toUpperCase();
  }

  // 6. Validate reporting manager (if updating)
  if (data.reportingManager !== undefined) {
    if (data.reportingManager) {
      const manager = await User.findById(data.reportingManager);

      if (!manager) {
        throw new AppError(
          "Reporting manager not found",
          404,
          "MANAGER_NOT_FOUND",
        );
      }

      if (manager.role !== ROLES.MANAGER) {
        throw new AppError(
          "Reporting manager must have manager role",
          400,
          "INVALID_REPORTING_MANAGER",
        );
      }

      const managerHasBranch = manager.branches.some(
        (id) => id.toString() === targetBranchId,
      );

      if (!managerHasBranch) {
        throw new AppError(
          "Reporting manager does not belong to this branch",
          400,
          "MANAGER_BRANCH_MISMATCH",
        );
      }

      employee.reportingManager = new Types.ObjectId(data.reportingManager);
    } else {
      employee.reportingManager = undefined;
    }
  }

  // 7. Update field mappings
  if (data.profileImage !== undefined) {
    employee.profileImage = data.profileImage ? data.profileImage : undefined;
  }
  if (data.designation !== undefined) employee.designation = data.designation;
  if (data.department !== undefined) employee.department = data.department;
  if (data.employmentType !== undefined)
    employee.employmentType = data.employmentType;
  if (data.employmentStatus !== undefined)
    employee.employmentStatus = data.employmentStatus;
  if (data.joiningDate !== undefined) employee.joiningDate = data.joiningDate;
  if (data.probationEndDate !== undefined)
    employee.probationEndDate = data.probationEndDate;
  if (data.dateOfBirth !== undefined) employee.dateOfBirth = data.dateOfBirth;
  if (data.gender !== undefined) employee.gender = data.gender;
  if (data.personalPhone !== undefined)
    employee.personalPhone = data.personalPhone;
  if (data.alternatePhone !== undefined)
    employee.alternatePhone = data.alternatePhone;
  if (data.address !== undefined) employee.address = data.address;
  if (data.city !== undefined) employee.city = data.city;
  if (data.state !== undefined) employee.state = data.state;
  if (data.country !== undefined) employee.country = data.country;
  if (data.postalCode !== undefined) employee.postalCode = data.postalCode;
  if (data.emergencyContactName !== undefined)
    employee.emergencyContactName = data.emergencyContactName;
  if (data.emergencyContactPhone !== undefined)
    employee.emergencyContactPhone = data.emergencyContactPhone;
  if (data.emergencyContactRelation !== undefined)
    employee.emergencyContactRelation = data.emergencyContactRelation;
  if (data.documents !== undefined) employee.documents = data.documents;
  if (data.salary !== undefined) {
    employee.salary = {
      ...employee.salary,
      ...data.salary,
    };
  }
  if (data.bankDetails !== undefined) employee.bankDetails = data.bankDetails;
  if (data.notes !== undefined) employee.notes = data.notes;

  await employee.save();

  return employee;
};

export const getEmployeeProfileById = async (
  identifier: string,
  context: AccessContext,
) => {
  if (!Types.ObjectId.isValid(identifier)) {
    throw new AppError("Invalid ID format", 400, "INVALID_ID_FORMAT");
  }

  // ✅ Search by either EmployeeProfile ID OR User ID
  const employee = await EmployeeProfile.findOne({
    $or: [
      { _id: new Types.ObjectId(identifier) },
      { user: new Types.ObjectId(identifier) },
    ],
  })
    .populate("user", "name email role isActive")
    .populate("branch", "name code city state")
    .populate("reportingManager", "name email role")
    .populate({
      path: "leaveBalances",
      match: {
        year: new Date().getFullYear(),
      },
      populate: {
        path: "policy",
        select: "name code leaveType annualAllocation isPaid",
      },
    })
    .lean({ virtuals: true });

  if (!employee) {
    throw new AppError("Employee profile not found", 404, "EMPLOYEE_NOT_FOUND");
  }

  const branchId = employee.branch._id.toString();

  if (context.role !== ROLES.HEAD && !context.branches.includes(branchId)) {
    throw new AppError(
      "You do not have access to this employee",
      403,
      "EMPLOYEE_ACCESS_DENIED",
    );
  }

  if (
    context.role === ROLES.EMPLOYEE &&
    employee.user._id.toString() !== context.userId
  ) {
    throw new AppError(
      "You can only access your own employee profile",
      403,
      "EMPLOYEE_ACCESS_DENIED",
    );
  }

  return employee;
};

export const listEmployees = async (
  context: AccessContext,
  options: {
    page: number;
    limit: number;
    branchId?: string | string[];
    reportingManager?: string; // Add to options object
    role?: string;
    status?: string;
    search?: string;
  },
) => {
  const filter: Record<string, unknown> = {};

  // 1. Enforce manager branch scoping for non-HEAD roles
  if (context.role !== ROLES.HEAD) {
    filter.branch = {
      $in: context.branches.map((id) => new Types.ObjectId(id)),
    };
  }

  // 2. Head role specific branch filtering — accepts either a single
  // branch ID or several (comma-separated/array, per the validator).
  if (options.branchId && context.role === ROLES.HEAD) {
    const branchIds = Array.isArray(options.branchId)
      ? options.branchId
      : [options.branchId];
    filter.branch =
      branchIds.length === 1
        ? new Types.ObjectId(branchIds[0])
        : { $in: branchIds.map((id) => new Types.ObjectId(id)) };
  }

  // 3. Filter by reportingManager (Matches key added to Zod Schema)
  if (options.reportingManager) {
    filter.reportingManager = new Types.ObjectId(options.reportingManager);
  }

  if (options.status) {
    filter.employmentStatus = options.status;
  }

  if (options.search) {
    filter.$or = [
      { employeeCode: { $regex: options.search, $options: "i" } },
      { designation: { $regex: options.search, $options: "i" } },
      { department: { $regex: options.search, $options: "i" } },
    ];
  }

  // 4. Force regular employee self-access limit
  if (context.role === ROLES.EMPLOYEE) {
    filter.user = new Types.ObjectId(context.userId);
  }

  const skip = (options.page - 1) * options.limit;

  const [items, total] = await Promise.all([
    EmployeeProfile.find(filter)
      .populate("user", "name email role isActive")
      .populate("branch", "name code city")
      .populate("reportingManager", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(options.limit)
      .lean(),

    EmployeeProfile.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.ceil(total / options.limit),
    },
  };
};

export const getEmployeeCountByBranch = async (
  branchId: string,
  context: AccessContext,
): Promise<{ branchId: string; totalEmployees: number }> => {
  if (!Types.ObjectId.isValid(branchId)) {
    throw new AppError("Invalid branch ID format", 400, "INVALID_BRANCH_ID");
  }

  // Ensure user has access to this branch
  assertBranchAccess(branchId, context);

  const totalEmployees = await EmployeeProfile.countDocuments({
    branch: new Types.ObjectId(branchId),
    employmentStatus: { $ne: "terminated" }, // Uses correct model field name
  });

  return {
    branchId,
    totalEmployees,
  };
};
