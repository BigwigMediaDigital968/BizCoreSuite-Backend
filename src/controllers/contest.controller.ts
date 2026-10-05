import { Request, Response, NextFunction } from "express";
import {
  createContest,
  getActiveContestsForUser,
  getContestById,
  updateContest,
  toggleContestStatus,
  getAllContestsForAdmin,
} from "../services/contest.service.js";
import { AppError } from "../utils/AppError.js";

export const launchContestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    const contest = await createContest(req.user, req.body, req.file);

    return res.status(201).json({ success: true, data: contest });
  } catch (err) {
    next(err);
  }
};

export const getAllContestsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const search = req.query.search ? (req.query.search as string) : undefined;
    const branchId = req.query.branchId
      ? (req.query.branchId as string)
      : undefined;

    let isActive: boolean | undefined = undefined;
    if (req.query.isActive !== undefined) {
      isActive = req.query.isActive === "true";
    }

    const result = await getAllContestsForAdmin(req.user, {
      page,
      limit,
      search,
      isActive,
      branchId,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const getMyBranchContestsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    const contests = await getActiveContestsForUser(req.user);
    return res.status(200).json({ success: true, data: contests });
  } catch (err) {
    next(err);
  }
};

export const getContestByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    const contest = await getContestById(req.params.id as string, req.user);
    return res.status(200).json({ success: true, data: contest });
  } catch (err) {
    next(err);
  }
};

export const updateContestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    const contestId = req.params.id as string;
    if (!contestId) {
      throw new AppError("Contest ID is required", 400, "ID_REQUIRED");
    }

    const updatedContest = await updateContest(
      contestId,
      req.user,
      req.body,
      req.file,
    );

    return res.status(200).json({ success: true, data: updatedContest });
  } catch (err) {
    next(err);
  }
};

export const toggleContestStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    const contestId = req.params.id as string;
    if (!contestId) {
      throw new AppError("Contest ID is required", 400, "ID_REQUIRED");
    }

    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      throw new AppError(
        "isActive field must be a boolean",
        400,
        "INVALID_INPUT",
      );
    }

    const contest = await toggleContestStatus(contestId, req.user, isActive);

    return res.status(200).json({
      success: true,
      message: `Contest ${isActive ? "activated" : "deactivated"} successfully`,
      data: contest,
    });
  } catch (err) {
    next(err);
  }
};
