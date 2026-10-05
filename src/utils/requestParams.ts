import type { Request } from "express";
import { AppError } from "./AppError.js";

export const getRequiredParam = (
  req: Request,
  paramName: string,
): string => {
  const value = req.params[paramName];

  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(
      `${paramName} is required`,
      400,
      "INVALID_ROUTE_PARAMETER",
    );
  }

  return value;
};