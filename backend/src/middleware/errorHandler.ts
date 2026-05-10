import type { NextFunction, Request, Response } from "express";

type ApiError = Error & {
  statusCode?: number;
  code?: string;
};

export const errorHandler = (
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err.statusCode ?? 500;
  const message = statusCode === 500 ? "Internal Server Error" : err.message;
  const code = err.code ?? (statusCode === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR");

  res.status(statusCode).json({
    success: false,
    error: message,
    code
  });
};
