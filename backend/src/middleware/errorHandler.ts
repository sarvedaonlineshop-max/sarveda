import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

import { logger } from "../config/logger";
import { MAX_ATTACHMENT_MB } from "../modules/enquiries/enquiries.constants";

type ApiError = Error & {
  statusCode?: number;
  status?: number;
  code?: string;
  userMessage?: string;
};

function prismaClientMessage(err: Prisma.PrismaClientKnownRequestError): string {
  if (err.code === "P2002") {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(", ") : "field";
    return `Duplicate value for ${target}. Change SKU or slug and try again.`;
  }
  if (err.code === "P2003") return "Related record not found.";
  if (err.code === "P2025") return "Record not found.";
  return "Database request failed.";
}

export const errorHandler = (
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode =
    err.statusCode ?? err.status ?? 500;
  let clientMessage = err.userMessage ?? err.message;
  let code = err.code ?? "REQUEST_ERROR";

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    statusCode = err.code === "P2002" ? 409 : 400;
    clientMessage = prismaClientMessage(err);
    code = err.code;
  }

  const fields = (err as ApiError & { fields?: Array<{ path: string; message: string }> }).fields;

  if (statusCode >= 500) {
    logger.error("api_error", { message: err.message, code, stack: err.stack });
  }

  if (
    err.message?.toLowerCase().includes("entity too large") ||
    (err as Error & { type?: string }).type === "entity.too.large"
  ) {
    statusCode = 413;
    clientMessage =
      `Upload too large (max ${MAX_ATTACHMENT_MB} MB per file). Try a smaller clip or compress the video.`;
    code = "PAYLOAD_TOO_LARGE";
  }

  res.status(statusCode).json({
    success: false,
    error: clientMessage || "Request failed",
    code: code || "REQUEST_ERROR",
    ...(fields?.length ? { fields } : {})
  });
};
