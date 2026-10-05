import multer from "multer";

import {
  LEAD_IMPORT_CONFIG,
} from "../config/leadImport.js";

const storage =
  multer.memoryStorage();

export const leadExcelUpload =
  multer({
    storage,

    limits: {
      fileSize:
        LEAD_IMPORT_CONFIG.maxFileSize,
    },

    fileFilter: (
      _req,
      file,
      cb,
    ) => {
      const allowedMimeTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
        "application/csv",
      ];

      const allowed =
        allowedMimeTypes.includes(
          file.mimetype,
        );

      if (!allowed) {
        return cb(
          new Error(
            "Only Excel or CSV files are allowed",
          ),
        );
      }

      cb(null, true);
    },
  });