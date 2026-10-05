import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error(error);

  // 1. Handle Zod Validation Errors (Returns HTTP 400)
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return res.status(400).json({
      success: false,
      message: issue ? `${issue.path.join(".")}: ${issue.message}` : "Validation error",
      code: "VALIDATION_ERROR",
      errors: error.flatten().fieldErrors,
    });
  }

  // 2. Handle Custom App Errors
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }

  // 3. Fallback Internal Server Error (Returns HTTP 500)
  return res.status(500).json({
    success: false,
    message: "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
  });
};