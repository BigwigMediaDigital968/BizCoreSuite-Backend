// import type { NextFunction, Request, Response } from "express";

// import { loginUser } from "../services/auth.service.js";
// import { loginSchema } from "../validators/auth.validator.js";
// import {
//   findValidSession,
//   revokeSession,
//   createSession,
// } from "../services/session.service.js";
// import { checkAccessPermission } from "../services/lateCheckIn.service.js";
// import { generateAccessToken } from "../utils/jwt.js";
// import { User } from "../models/User.js";
// import { AppError } from "../utils/AppError.js";
// import { auditRequest } from "../utils/audit.js";
// import { AUDIT_ACTIONS } from "../constants/auditActions.js";
// import { AUDIT_ENTITIES } from "../constants/auditEntities.js";

// export const loginController = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   try {
//     const data = loginSchema.parse(req.body || {});

//     const result = await loginUser(
//       data.email,
//       data.password,
//       req.get("user-agent"),
//       req.ip,
//     );

//     // 1. Working Hours & Late Check-in Guard
//     const primaryBranchId = result.user.branches?.[0]?.toString();
//     const access = await checkAccessPermission(
//       result.user._id.toString(),
//       result.user.role,
//       primaryBranchId,
//     );

//     if (!access.allowed) {
//       return res.status(403).json({
//         success: false,
//         code: "AFTER_HOURS_LOCKOUT",
//         message: access.message,
//         reasonRequired: access.reasonRequired,
//         user: {
//           id: result.user._id,
//           name: result.user.name,
//           email: result.user.email,
//           role: result.user.role,
//           branch: primaryBranchId,
//         },
//       });
//     }

//     // 2. Audit and Return Token on Valid Access
//     await auditRequest({
//       req,
//       action: AUDIT_ACTIONS.LOGIN_SUCCESS,
//       entity: AUDIT_ENTITIES.AUTH,
//       entityId: result.user._id,
//       metadata: {
//         role: result.user.role,
//       },
//     });

//     return res.status(200).json({
//       success: true,
//       message: "Login successful",
//       data: {
//         user: result.user,
//         accessToken: result.accessToken,
//         refreshToken: result.refreshToken,
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// export const refreshController = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   try {
//     const { refreshToken } = req.body;

//     if (!refreshToken || typeof refreshToken !== "string") {
//       throw new AppError(
//         "Refresh token is required",
//         400,
//         "REFRESH_TOKEN_REQUIRED",
//       );
//     }

//     const session = await findValidSession(refreshToken);

//     if (!session) {
//       throw new AppError("Invalid refresh token", 401, "INVALID_REFRESH_TOKEN");
//     }

//     const user = await User.findById(session.user)
//       .select("_id name email role branches isActive")
//       .lean();

//     if (!user) {
//       throw new AppError("User account not found", 401, "ACCOUNT_NOT_FOUND");
//     }

//     if (!user.isActive) {
//       throw new AppError("Your account is inactive", 401, "ACCOUNT_INACTIVE");
//     }

//     // Working Hours Check during Token Refresh
//     const primaryBranchId = user.branches?.[0]?.toString();
//     const access = await checkAccessPermission(
//       user._id.toString(),
//       user.role,
//       primaryBranchId,
//     );

//     if (!access.allowed) {
//       return res.status(403).json({
//         success: false,
//         code: "AFTER_HOURS_LOCKOUT",
//         message: access.message,
//         reasonRequired: access.reasonRequired,
//       });
//     }

//     await revokeSession(session._id.toString());

//     const newAccessToken = generateAccessToken(user._id.toString());

//     const newRefreshToken = await createSession({
//       userId: user._id.toString(),
//       userAgent: req.get("user-agent"),
//       ipAddress: req.ip,
//     });

//     return res.status(200).json({
//       success: true,
//       message: "Token refreshed successfully",
//       data: {
//         accessToken: newAccessToken,
//         refreshToken: newRefreshToken,
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// export const logoutController = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   try {
//     if (req.user) {
//       await auditRequest({
//         req,
//         action: AUDIT_ACTIONS.LOGOUT,
//         entity: AUDIT_ENTITIES.AUTH,
//         entityId: req.user.id,
//       });
//     }

//     const { refreshToken } = req.body;

//     if (!refreshToken || typeof refreshToken !== "string") {
//       throw new AppError(
//         "Refresh token is required",
//         400,
//         "REFRESH_TOKEN_REQUIRED",
//       );
//     }

//     const session = await findValidSession(refreshToken);

//     if (session) {
//       await revokeSession(session._id.toString());
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Logout successful",
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// export const getMeController = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   try {
//     if (!req.user?.id) {
//       throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
//     }

//     const user = await User.findById(req.user.id).select("-password").lean();

//     if (!user) {
//       throw new AppError("User account not found", 404, "USER_NOT_FOUND");
//     }

//     return res.status(200).json({
//       success: true,
//       data: {
//         user: {
//           ...user,
//           createdAt: user.createdAt,
//           updatedAt: user.updatedAt,
//         },
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };


import type { NextFunction, Request, Response } from "express";

import {
  loginUser,
  updateOwnProfile,
  changeOwnPassword,
  changeEmployeePassword,
} from "../services/auth.service.js";
import {
  loginSchema,
  updateMeSchema,
  changePasswordSchema,
  resetPasswordSchema,
} from "../validators/auth.validator.js";
import {
  findValidSession,
  revokeSession,
  createSession,
} from "../services/session.service.js";
import { checkAccessPermission } from "../services/lateCheckIn.service.js";
import { generateAccessToken, generateLateCheckInToken } from "../utils/jwt.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { auditRequest } from "../utils/audit.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import { AUDIT_ENTITIES } from "../constants/auditEntities.js";
import { getRequiredParam } from "../utils/requestParams.js";

// export const loginController = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   try {
//     const data = loginSchema.parse(req.body || {});

//     const result = await loginUser(
//       data.email,
//       data.password,
//       req.get("user-agent"),
//       req.ip,
//     );

//     // 1. Working Hours & Holiday Access Guard
//     const primaryBranchId = result.user.branches?.[0]?.toString();
//     const access = await checkAccessPermission(
//       result.user._id.toString(),
//       result.user.role,
//       primaryBranchId,
//     );

//     if (!access.allowed) {
//       return res.status(403).json({
//         success: false,
//         code: access.code || "ACCESS_RESTRICTED",
//         message: access.message,
//         reasonRequired: access.reasonRequired,
//         user: {
//           id: result.user._id,
//           name: result.user.name,
//           email: result.user.email,
//           role: result.user.role,
//           branch: primaryBranchId,
//         },
//       });
//     }

//     // 2. Audit and Return Token on Valid Access
//     await auditRequest({
//       req,
//       action: AUDIT_ACTIONS.LOGIN_SUCCESS,
//       entity: AUDIT_ENTITIES.AUTH,
//       entityId: result.user._id,
//       metadata: {
//         role: result.user.role,
//       },
//     });

//     return res.status(200).json({
//       success: true,
//       message: "Login successful.",
//       data: {
//         user: result.user,
//         accessToken: result.accessToken,
//         refreshToken: result.refreshToken,
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };

export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = loginSchema.parse(req.body || {});

    const result = await loginUser(
      data.email,
      data.password,
      req.get("user-agent"),
      req.ip,
    );

    // FIX 1: Explicitly attach authenticated user to request object so trackActivity middleware can read it!
    (req as any).user = result.user;

    // 1. Working Hours & Holiday Access Guard
    const primaryBranchId = result.user.branches?.[0]?.toString();
    const access = await checkAccessPermission(
      result.user._id.toString(),
      result.user.role,
      primaryBranchId,
    );

    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        code: access.code || "ACCESS_RESTRICTED",
        message: access.message,
        reasonRequired: access.reasonRequired,
        // Lets the client submit a late-checkin reason on the user's behalf
        // without a full access token — see generateLateCheckInToken().
        lockoutToken: generateLateCheckInToken(result.user._id.toString()),
        user: {
          id: result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
          branch: primaryBranchId,
        },
      });
    }

    // 2. Audit and Return Token on Valid Access
    await auditRequest({
      req,
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entity: AUDIT_ENTITIES.AUTH,
      entityId: result.user._id,
      metadata: {
        role: result.user.role,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};


export const refreshController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== "string") {
      throw new AppError(
        "A valid refresh token must be provided.",
        400,
        "REFRESH_TOKEN_REQUIRED",
      );
    }

    const session = await findValidSession(refreshToken);

    if (!session) {
      throw new AppError("Session has expired or is invalid. Please log in again.", 401, "INVALID_REFRESH_TOKEN");
    }

    const user = await User.findById(session.user)
      .select("_id name email role branches isActive")
      .lean();

    if (!user) {
      throw new AppError("Associated user account no longer exists.", 401, "ACCOUNT_NOT_FOUND");
    }

    if (!user.isActive) {
      throw new AppError("Your account has been deactivated.", 401, "ACCOUNT_INACTIVE");
    }

    // Working Hours & Holiday Access Guard during Token Refresh
    const primaryBranchId = user.branches?.[0]?.toString();
    const access = await checkAccessPermission(
      user._id.toString(),
      user.role,
      primaryBranchId,
    );

    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        code: access.code || "ACCESS_RESTRICTED",
        message: access.message,
        reasonRequired: access.reasonRequired,
      });
    }

    await revokeSession(session._id.toString());

    const newAccessToken = generateAccessToken(user._id.toString());

    const newRefreshToken = await createSession({
      userId: user._id.toString(),
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully.",
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logoutController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (req.user) {
      await auditRequest({
        req,
        action: AUDIT_ACTIONS.LOGOUT,
        entity: AUDIT_ENTITIES.AUTH,
        entityId: req.user.id,
      });
    }

    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== "string") {
      throw new AppError(
        "A valid refresh token must be provided.",
        400,
        "REFRESH_TOKEN_REQUIRED",
      );
    }

    const session = await findValidSession(refreshToken);

    if (session) {
      await revokeSession(session._id.toString());
    }

    return res.status(200).json({
      success: true,
      message: "Logout successful.",
    });
  } catch (error) {
    next(error);
  }
};

export const getMeController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      throw new AppError("Authentication required.", 401, "UNAUTHORIZED");
    }

    const user = await User.findById(req.user.id).select("-password").lean();

    if (!user) {
      throw new AppError("User profile not found.", 404, "USER_NOT_FOUND");
    }

    return res.status(200).json({
      success: true,
      data: {
        user: {
          ...user,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateMeController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      throw new AppError("Authentication required.", 401, "UNAUTHORIZED");
    }

    const data = updateMeSchema.parse(req.body || {});

    const user = await updateOwnProfile(req.user.id, data);

    await auditRequest({
      req,
      action: AUDIT_ACTIONS.USER_UPDATED,
      entity: AUDIT_ENTITIES.USER,
      entityId: user._id.toString(),
      metadata: { updatedFields: ["name"] },
    });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          branches: user.branches,
          isActive: user.isActive,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const changeMyPasswordController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      throw new AppError("Authentication required.", 401, "UNAUTHORIZED");
    }

    const data = changePasswordSchema.parse(req.body || {});

    await changeOwnPassword(req.user.id, data.currentPassword, data.newPassword);

    await auditRequest({
      req,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entity: AUDIT_ENTITIES.AUTH,
      entityId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    next(error);
  }
};

export const changeEmployeePasswordController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      throw new AppError("Authentication required.", 401, "UNAUTHORIZED");
    }

    const data = resetPasswordSchema.parse(req.body || {});
    const empoyeeId =  getRequiredParam(req, "id")

    await changeEmployeePassword(empoyeeId, data.newPassword);

    await auditRequest({
      req,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entity: AUDIT_ENTITIES.AUTH,
      entityId: empoyeeId,
    });

    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    next(error);
  }
};