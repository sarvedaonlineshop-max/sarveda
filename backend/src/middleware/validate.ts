import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((e) => ({
        path: e.path.join(".") || "body",
        message: e.message
      }));
      const message = fields.map((f) => `${f.path}: ${f.message}`).join("; ");
      const err = new Error(message) as Error & {
        statusCode?: number;
        code?: string;
        fields?: Array<{ path: string; message: string }>;
      };
      err.statusCode = 400;
      err.code = "VALIDATION_ERROR";
      err.fields = fields;
      return next(err);
    }
    req.body = parsed.data;
    next();
  };
}
