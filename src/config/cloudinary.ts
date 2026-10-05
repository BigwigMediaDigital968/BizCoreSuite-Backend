// src/config/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { AppError } from "../utils/AppError.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();

export const uploadMedia = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "application/pdf",
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          "Invalid file type. Only JPG, PNG, WEBP, MP4, MOV, and PDF are allowed.",
          400,
          "INVALID_FILE_TYPE",
        ),
      );
    }
  },
});

export const uploadToCloudinary = (
  fileBuffer: Buffer,
  folder: string,
  mimetype: string,
): Promise<{
  url: string;
  publicId: string;
  resourceType: "image" | "video" | "raw";
  format?: string;
}> => {
  return new Promise((resolve, reject) => {
    // PDF must be uploaded as 'raw' to avoid Cloudinary 403 errors
    let resourceType: "image" | "video" | "raw" = "image";
    if (mimetype === "application/pdf") {
      resourceType = "raw";
    } else if (mimetype.startsWith("video/")) {
      resourceType = "video";
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary Detailed Error:", error);
          return reject(
            new AppError(
              `Cloudinary upload failed: ${error.message}`,
              500,
              "CLOUDINARY_ERROR",
            ),
          );
        }
        if (!result) {
          return reject(
            new AppError("Cloudinary upload failed", 500, "UPLOAD_FAILED"),
          );
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType,
          format: result.format || (resourceType === "raw" ? "pdf" : undefined),
        });
      },
    );

    uploadStream.end(fileBuffer);
  });
};

// Add these helper functions at the end of src/config/cloudinary.ts

export const deleteFromCloudinary = (
  publicId: string,
  resourceType: "image" | "video" | "raw" = "image",
): Promise<void> => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(
      publicId,
      { resource_type: resourceType, invalidate: true },
      (error, result) => {
        if (error) {
          return reject(
            new AppError(
              `Cloudinary deletion failed: ${error.message}`,
              500,
              "CLOUDINARY_DELETE_ERROR",
            ),
          );
        }
        if (result?.result !== "ok" && result?.result !== "not found") {
          return reject(
            new AppError(
              `Cloudinary deletion failed for ID: ${publicId}`,
              500,
              "CLOUDINARY_DELETE_ERROR",
            ),
          );
        }
        resolve();
      },
    );
  });
};
