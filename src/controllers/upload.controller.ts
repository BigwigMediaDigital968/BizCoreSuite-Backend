import { Request, Response, NextFunction } from "express";
import {
  processSingleUpload,
  processMultipleUploads,
  processFileUpdate,
  processFileDelete,
} from "../services/upload.service.js";
import { AppError } from "../utils/AppError.js";

// Upload Single File
export const uploadSingleHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const folder = (req.query.folder as string) || "uploads";
    const data = await processSingleUpload(req.file, folder);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// Upload Multiple Files
export const uploadMultipleHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const folder = (req.query.folder as string) || "uploads";
    const files = req.files as Express.Multer.File[];
    const data = await processMultipleUploads(files, folder);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// Update File
export const updateFileHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { oldPublicId, resourceType } = req.body;
    const folder = (req.query.folder as string) || "uploads";

    if (!oldPublicId) {
      throw new AppError(
        "oldPublicId is required in request body",
        400,
        "INVALID_INPUT",
      );
    }

    const data = await processFileUpdate(
      req.file,
      oldPublicId,
      folder,
      resourceType || "image",
    );

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// Delete File
export const deleteFileHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { publicId, resourceType } = req.body;

    if (!publicId) {
      throw new AppError(
        "publicId is required in request body",
        400,
        "INVALID_INPUT",
      );
    }

    const data = await processFileDelete(publicId, resourceType || "image");
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
