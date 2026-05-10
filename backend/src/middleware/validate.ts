import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((e) => `${e.path.join(".") || "body"}: ${e.message}`)
        .join("; ");
      const err = new Error(message) as Error & { statusCode?: number; code?: string };
      err.statusCode = 400;
      err.code = "VALIDATION_ERROR";
      return next(err);
    }
    req.body = parsed.data;
    next();
  };
}
