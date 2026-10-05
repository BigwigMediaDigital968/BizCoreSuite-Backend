import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../config/cloudinary.js";
import { AppError } from "../utils/AppError.js";

interface UploadedFileResult {
  url: string;
  publicId: string;
  resourceType: "image" | "video" | "raw";
  format?: string;
}

// 1. Upload Single File
export const processSingleUpload = async (
  file: Express.Multer.File | undefined,
  folder: string = "uploads",
): Promise<UploadedFileResult> => {
  if (!file) {
    throw new AppError("No file provided", 400, "MISSING_FILE");
  }

  return await uploadToCloudinary(file.buffer, folder, file.mimetype);
};

// 2. Upload Multiple Files
export const processMultipleUploads = async (
  files: Express.Multer.File[] | undefined,
  folder: string = "uploads",
): Promise<UploadedFileResult[]> => {
  if (!files || files.length === 0) {
    throw new AppError("No files provided", 400, "MISSING_FILES");
  }

  const uploadPromises = files.map((file) =>
    uploadToCloudinary(file.buffer, folder, file.mimetype),
  );

  return await Promise.all(uploadPromises);
};

// 3. Update Existing File (Deletes old, uploads new)
export const processFileUpdate = async (
  file: Express.Multer.File | undefined,
  oldPublicId: string,
  folder: string = "uploads",
  oldResourceType: "image" | "video" | "raw" = "image",
): Promise<UploadedFileResult> => {
  if (!file) {
    throw new AppError(
      "New file is required for replacement",
      400,
      "MISSING_FILE",
    );
  }

  if (!oldPublicId) {
    throw new AppError("Old public ID is required", 400, "MISSING_PUBLIC_ID");
  }

  // Delete existing file first
  await deleteFromCloudinary(oldPublicId, oldResourceType);

  // Upload new replacement file
  return await uploadToCloudinary(file.buffer, folder, file.mimetype);
};

// 4. Delete File
export const processFileDelete = async (
  publicId: string,
  resourceType: "image" | "video" | "raw" = "image",
): Promise<{ success: boolean; message: string }> => {
  if (!publicId) {
    throw new AppError("Public ID is required", 400, "MISSING_PUBLIC_ID");
  }

  await deleteFromCloudinary(publicId, resourceType);

  return {
    success: true,
    message: "File successfully deleted from Cloudinary",
  };
};
