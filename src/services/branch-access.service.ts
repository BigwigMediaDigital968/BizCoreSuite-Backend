import { User } from "../models/User.js";
import { Branch } from "../models/Branch.js";
import { ROLES } from "../constants/roles.js";

export const validateBranchAccess = async ({
  userId,
  branchId,
}: {
  userId: string;
  branchId: string;
}) => {
  const user = await User.findById(userId)
    .select("_id role branches isActive")
    .lean();

  if (!user) {
    return false;
  }

  if (!user.isActive) {
    return false;
  }

  if (user.role === ROLES.HEAD) {
    return true;
  }

  return user.branches.some(
    (branch) => branch.toString() === branchId.toString(),
  );
};
