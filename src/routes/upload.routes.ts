import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { uploadMedia } from "../config/cloudinary.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  uploadSingleHandler,
  uploadMultipleHandler,
  updateFileHandler,
  deleteFileHandler,
} from "../controllers/upload.controller.js";
import { AppError } from "../utils/AppError.js";

const router = Router();

// Wrap multer execution to catch multer-specific errors smoothly
const handleMulterUpload = (multerMiddleware: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    multerMiddleware(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new AppError(
              "File size limit exceeded (Max 50MB)",
              400,
              "FILE_TOO_LARGE",
            ),
          );
        }
        return next(new AppError(err.message, 400, "MULTER_ERROR"));
      } else if (err) {
        return next(err);
      }
      next();
    });
  };
};

router.use(authenticate);

// 1. Upload Single File (Form-Data field key: "file")
router.post(
  "/single",
  handleMulterUpload(uploadMedia.single("file")),
  uploadSingleHandler,
);

// 2. Upload Multiple Files (Form-Data field key: "files", Max 10)
router.post(
  "/multiple",
  handleMulterUpload(uploadMedia.array("files", 10)),
  uploadMultipleHandler,
);

// 3. Update Existing File (Form-Data field key: "file", body: { oldPublicId, resourceType? })
router.put(
  "/update",
  handleMulterUpload(uploadMedia.single("file")),
  updateFileHandler,
);

// 4. Delete File from Cloudinary (JSON body: { publicId, resourceType? })
router.delete("/delete", deleteFileHandler);

export default router;
