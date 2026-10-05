import mongoose from "mongoose";

import { Task, type ITask } from "../models/Task.js";
import { TASK_STATUS } from "../constants/taskStatus.js";
import { TASK_UPDATE_FIELDS } from "../constants/taskPermissions.js";
import { TASK_PRIORITY, type TaskPriority } from "../constants/taskPriority.js";
import { User } from "../models/User.js";
import { Lead } from "../models/Lead.js";
import { ROLES } from "../constants/roles.js";
import { AppError } from "../utils/AppError.js";
import { AuthenticatedUser } from "../types/auth.js";
import { createTaskActivity } from "./task-activity.service.js";
import { TASK_ACTIVITY_TYPE } from "../constants/taskActivity.js";

interface CreateTaskInput {
  title: string;
  description?: string;
  leads?: string[];
  assignedTo: string;
  priority?: TaskPriority;
  dueDate?: string;
  remarks?: string;
}

interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
  remarks?: string;
  completedAt?: string | null;
  assignedTo?: string;
  branch?: string;
  leads?: string[] | null;
}

interface GetTasksQueryParams {
  branch?: string;
  assignedTo?: string;
  lead?: string; // Query tasks linked to a specific lead ID
  status?: string;
  priority?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export const createTask = async (
  data: CreateTaskInput,
  creatorId: string,
): Promise<ITask> => {
  if (!mongoose.Types.ObjectId.isValid(creatorId)) {
    throw new AppError("Invalid creator ID", 400, "INVALID_CREATOR_ID");
  }

  if (!mongoose.Types.ObjectId.isValid(data.assignedTo)) {
    throw new AppError("Invalid employee ID", 400, "INVALID_EMPLOYEE_ID");
  }

  const creator = await User.findById(creatorId)
    .select("_id role branches isActive")
    .lean();

  if (!creator || !creator.isActive) {
    throw new AppError(
      "Creator account is inactive or not found",
      403,
      "CREATOR_UNAVAILABLE",
    );
  }

  const employee = await User.findById(data.assignedTo)
    .select("_id name email role branches isActive")
    .lean();

  if (!employee || !employee.isActive) {
    throw new AppError(
      "Assigned employee not found or inactive",
      400,
      "EMPLOYEE_UNAVAILABLE",
    );
  }

  if (employee.role !== ROLES.EMPLOYEE) {
    throw new AppError(
      "Tasks can only be assigned to employees",
      400,
      "INVALID_ASSIGNEE_ROLE",
    );
  }

  let branchId: string;
  const employeeBranches = (employee.branches || []).map((b) => b.toString());

  if (employeeBranches.length === 0) {
    throw new AppError(
      "Employee is not assigned to any branch",
      400,
      "EMPLOYEE_NO_BRANCH",
    );
  }

  if (creator.role === ROLES.HEAD) {
    const primaryBranch = employeeBranches[0];

    if (employeeBranches.length > 1) {
      throw new AppError(
        "Employee must have a single working branch for task assignment",
        400,
        "AMBIGUOUS_EMPLOYEE_BRANCH",
      );
    }

    if (!primaryBranch) {
      throw new AppError(
        "Employee branch could not be determined",
        400,
        "EMPLOYEE_BRANCH_NOT_FOUND",
      );
    }

    branchId = primaryBranch;
  } else {
    const creatorBranches = (creator.branches || []).map((b) => b.toString());
    const matchingBranch = employeeBranches.find((b) =>
      creatorBranches.includes(b),
    );

    if (!matchingBranch) {
      throw new AppError(
        "Employee does not belong to your branch",
        403,
        "CROSS_BRANCH_ASSIGNMENT",
      );
    }
    branchId = matchingBranch;
  }

  // ✅ Validate leads array if provided
  let leadObjectIds: mongoose.Types.ObjectId[] = [];

  if (data.leads && data.leads.length > 0) {
    const invalidLeadIds = data.leads.filter(
      (id) => !mongoose.Types.ObjectId.isValid(id),
    );
    if (invalidLeadIds.length > 0) {
      throw new AppError(
        "One or more Lead IDs are invalid",
        400,
        "INVALID_LEAD_IDS",
      );
    }

    const matchedLeads = await Lead.find({
      _id: { $in: data.leads },
      isDeleted: false,
    })
      .select("_id branch")
      .lean();

    if (matchedLeads.length !== data.leads.length) {
      throw new AppError(
        "One or more leads were not found",
        444,
        "LEADS_NOT_FOUND",
      );
    }

    const invalidBranchLead = matchedLeads.find(
      (l) => l.branch?.toString() !== branchId,
    );
    if (invalidBranchLead) {
      throw new AppError(
        "All leads must belong to the task's assigned branch",
        403,
        "CROSS_BRANCH_LEAD",
      );
    }

    leadObjectIds = matchedLeads.map((l) => l._id as mongoose.Types.ObjectId);
  }

  const task = await Task.create({
    title: data.title,
    description: data.description,
    branch: new mongoose.Types.ObjectId(branchId),
    leads: leadObjectIds,
    assignedTo: new mongoose.Types.ObjectId(data.assignedTo),
    assignedBy: new mongoose.Types.ObjectId(creatorId),
    priority: data.priority,
    dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    remarks: data.remarks,
    createdBy: new mongoose.Types.ObjectId(creatorId),
  });

  await createTaskActivity({
    task: task._id.toString(),
    activityType: TASK_ACTIVITY_TYPE.CREATED,
    performedBy: creatorId,
    branch: task.branch.toString(),
    metadata: {
      title: task.title,
      assignedTo: task.assignedTo.toString(),
      leadsCount: leadObjectIds.length,
      priority: task.priority,
      status: task.status,
    },
  });

  return task;
};

export const updateTask = async (
  taskId: string,
  data: UpdateTaskInput,
  user: AuthenticatedUser,
) => {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new AppError("Invalid task ID", 400, "INVALID_TASK_ID");
  }

  const task = await Task.findOne({ _id: taskId, isDeleted: false });
  if (!task) {
    throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
  }

  // Check access permissions
  if (user.role === ROLES.EMPLOYEE && task.assignedTo.toString() !== user.id) {
    throw new AppError(
      "You do not have access to this task",
      403,
      "TASK_ACCESS_DENIED",
    );
  }

  if (user.role !== ROLES.HEAD && user.role !== ROLES.EMPLOYEE) {
    const userBranchIds = (user.branches || []).map((b) => b.toString());
    if (!userBranchIds.includes(task.branch.toString())) {
      throw new AppError(
        "You do not have access to this task",
        403,
        "TASK_ACCESS_DENIED",
      );
    }
  }

  // Handle Branch Update
  let targetBranchId = task.branch.toString();
  if (data.branch !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(data.branch)) {
      throw new AppError("Invalid branch ID", 400, "INVALID_BRANCH_ID");
    }
    targetBranchId = data.branch;
    task.branch = new mongoose.Types.ObjectId(data.branch);
  }

  // Handle Assignee / Reassignment Update
  let previousAssigneeId: string | undefined;
  if (data.assignedTo !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(data.assignedTo)) {
      throw new AppError("Invalid employee ID", 400, "INVALID_EMPLOYEE_ID");
    }

    const employee = await User.findById(data.assignedTo)
      .select("_id name role branches isActive")
      .lean();

    if (!employee || !employee.isActive) {
      throw new AppError(
        "Assigned employee not found or inactive",
        400,
        "EMPLOYEE_UNAVAILABLE",
      );
    }

    if (employee.role !== ROLES.EMPLOYEE) {
      throw new AppError(
        "Tasks can only be assigned to employees",
        400,
        "INVALID_ASSIGNEE_ROLE",
      );
    }

    const employeeBranches = (employee.branches || []).map((b) => b.toString());
    if (!employeeBranches.includes(targetBranchId)) {
      throw new AppError(
        "Employee does not belong to the selected branch",
        400,
        "CROSS_BRANCH_ASSIGNMENT",
      );
    }

    if (task.assignedTo.toString() !== data.assignedTo) {
      previousAssigneeId = task.assignedTo.toString();
      task.assignedTo = new mongoose.Types.ObjectId(data.assignedTo);
      task.assignedBy = new mongoose.Types.ObjectId(user.id);
    }
  }

  // Validate leads update
  if (data.leads !== undefined) {
    if (data.leads === null || data.leads.length === 0) {
      task.leads = [];
    } else {
      const invalidLeadIds = data.leads.filter(
        (id) => !mongoose.Types.ObjectId.isValid(id),
      );
      if (invalidLeadIds.length > 0) {
        throw new AppError(
          "One or more Lead IDs are invalid",
          400,
          "INVALID_LEAD_IDS",
        );
      }

      const matchedLeads = await Lead.find({
        _id: { $in: data.leads },
        isDeleted: false,
      })
        .select("_id branch")
        .lean();

      if (matchedLeads.length !== data.leads.length) {
        throw new AppError(
          "One or more leads were not found",
          404,
          "LEADS_NOT_FOUND",
        );
      }

      const invalidBranchLead = matchedLeads.find(
        (l) => l.branch?.toString() !== targetBranchId,
      );
      if (invalidBranchLead) {
        throw new AppError(
          "All leads must belong to the task's assigned branch",
          403,
          "CROSS_BRANCH_LEAD",
        );
      }

      task.leads = matchedLeads.map((l) => l._id as mongoose.Types.ObjectId);
    }
  }

  // Apply general field updates
  if (data.title !== undefined) task.title = data.title;
  if (data.description !== undefined) task.description = data.description;
  if (data.priority !== undefined)
    task.priority = data.priority as typeof task.priority;
  if (data.status !== undefined) {
    task.status = data.status as typeof task.status;
    task.completedAt =
      data.status === TASK_STATUS.COMPLETED ? new Date() : undefined;
  }
  if (data.dueDate !== undefined)
    task.dueDate = data.dueDate ? new Date(data.dueDate) : undefined;
  if (data.remarks !== undefined) task.remarks = data.remarks;

  await task.save();

  // Log activity if reassigned
  if (previousAssigneeId) {
    await createTaskActivity({
      task: task._id.toString(),
      activityType: TASK_ACTIVITY_TYPE.REASSIGNED,
      performedBy: user.id,
      branch: task.branch.toString(),
      metadata: {
        from: previousAssigneeId,
        to: task.assignedTo.toString(),
      },
    });
  }

  // Return fully populated task document
  return Task.findById(task._id)
    .populate("assignedTo", "name email role branches")
    .populate("assignedBy", "name email role")
    .populate("createdBy", "name email role")
    .populate("leads", "name phone email status")
    .populate("branch", "name code")
    .lean();
};

export const getTasks = async (
  user: AuthenticatedUser,
  queryParams: GetTasksQueryParams = {},
) => {
  if (!user || !user.role) {
    throw new AppError(
      "Authentication required",
      401,
      "AUTHENTICATION_REQUIRED",
    );
  }

  const filter: Record<string, unknown> = { isDeleted: false };

  // 1. Role-based scoping (Base permissions)
  switch (user.role) {
    case ROLES.HEAD:
      break;

    case ROLES.EMPLOYEE: {
      if (!mongoose.Types.ObjectId.isValid(user.id)) {
        throw new AppError("Invalid user ID", 400, "INVALID_USER_ID");
      }
      filter.assignedTo = new mongoose.Types.ObjectId(user.id);
      break;
    }

    case ROLES.ADMIN:
    case ROLES.MANAGER: {
      const userBranches = user.branches || [];

      if (userBranches.length === 0) {
        throw new AppError(
          "You are not assigned to any branches. Access denied.",
          403,
          "NO_BRANCH_ASSIGNED",
        );
      }

      const branchIds = userBranches
        .map((b) => (typeof b === "object" && "_id" in b ? (b as any)._id : b))
        .filter((id) => mongoose.Types.ObjectId.isValid(id.toString()))
        .map((id) => new mongoose.Types.ObjectId(id.toString()));

      if (branchIds.length === 0) {
        throw new AppError(
          "No valid branch IDs found for user",
          400,
          "INVALID_BRANCH_IDS",
        );
      }

      filter.branch = { $in: branchIds };
      break;
    }

    default:
      throw new AppError(
        `Role '${user.role}' is not authorized to access tasks`,
        403,
        "UNAUTHORIZED_ROLE",
      );
  }

  // 2. Query Parameters Filters

  // Filter by lead ID (Checks if array contains the given lead ID)
  if (queryParams.lead) {
    if (!mongoose.Types.ObjectId.isValid(queryParams.lead)) {
      throw new AppError("Invalid Lead ID in query", 400, "INVALID_LEAD_ID");
    }
    filter.leads = new mongoose.Types.ObjectId(queryParams.lead);
  }

  // Filter by branch (Restricted by user scope for non-HEAD)
  if (queryParams.branch) {
    if (!mongoose.Types.ObjectId.isValid(queryParams.branch)) {
      throw new AppError(
        "Invalid Branch ID in query",
        400,
        "INVALID_BRANCH_ID",
      );
    }
    const requestedBranch = new mongoose.Types.ObjectId(queryParams.branch);

    if (user.role === ROLES.ADMIN || user.role === ROLES.MANAGER) {
      const allowedBranchIds = (
        filter.branch as { $in: mongoose.Types.ObjectId[] }
      ).$in;
      const isAllowed = allowedBranchIds.some((b) => b.equals(requestedBranch));
      if (!isAllowed) {
        throw new AppError(
          "Access denied to requested branch",
          403,
          "BRANCH_ACCESS_DENIED",
        );
      }
    }
    filter.branch = requestedBranch;
  }

  // Filter by assigned employee (Only HEAD/Admin/Manager can filter by other assignees)
  if (queryParams.assignedTo && user.role !== ROLES.EMPLOYEE) {
    if (!mongoose.Types.ObjectId.isValid(queryParams.assignedTo)) {
      throw new AppError(
        "Invalid Employee ID in query",
        400,
        "INVALID_EMPLOYEE_ID",
      );
    }
    filter.assignedTo = new mongoose.Types.ObjectId(queryParams.assignedTo);
  }

  // Filter by status & priority
  if (queryParams.status) {
    filter.status = queryParams.status;
  }

  if (queryParams.priority) {
    filter.priority = queryParams.priority;
  }

  // Search filter (title / description)
  if (queryParams.search) {
    filter.$or = [
      { title: { $regex: queryParams.search, $options: "i" } },
      { description: { $regex: queryParams.search, $options: "i" } },
    ];
  }

  // Date range filter on dueDate
  if (queryParams.startDate || queryParams.endDate) {
    const dateFilter: Record<string, Date> = {};
    if (queryParams.startDate)
      dateFilter.$gte = new Date(queryParams.startDate);
    if (queryParams.endDate) dateFilter.$lte = new Date(queryParams.endDate);
    filter.dueDate = dateFilter;
  }

  return Task.find(filter)
    .populate("assignedTo", "name email role")
    .populate("assignedBy", "name email role")
    .populate("leads", "name phone email status")
    .populate("branch", "name code")
    .sort({ createdAt: -1 });
};

export const getTaskById = async (taskId: string, user: AuthenticatedUser) => {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new AppError("Invalid task ID", 400, "INVALID_TASK_ID");
  }

  const task = await Task.findOne({
    _id: taskId,
    isDeleted: false,
  })
    .populate("assignedTo", "name email role branches")
    .populate("assignedBy", "name email role")
    .populate("createdBy", "name email role")
    .populate("leads", "name phone email status")
    .populate("branch", "name code")
    .lean();

  if (!task) {
    throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
  }

  /*
   * HEAD can access every task.
   */
  if (user.role === ROLES.HEAD) {
    return task;
  }

  const taskBranchId = task.branch._id.toString();

  /*
   * EMPLOYEE can only access tasks assigned to themselves.
   */
  if (user.role === ROLES.EMPLOYEE) {
    if (task.assignedTo._id.toString() !== user.id) {
      throw new AppError(
        "You do not have access to this task",
        403,
        "TASK_ACCESS_DENIED",
      );
    }

    return task;
  }

  /*
   * ADMIN / MANAGER can access tasks
   * belonging to their assigned branches.
   */
  const userBranchIds = (user.branches || []).map((branchId) =>
    branchId.toString(),
  );

  if (!userBranchIds.includes(taskBranchId)) {
    throw new AppError(
      "You do not have access to this task",
      403,
      "TASK_ACCESS_DENIED",
    );
  }

  return task;
};
