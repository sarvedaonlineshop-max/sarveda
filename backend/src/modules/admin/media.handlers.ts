import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { uploadAsset } from "../../config/s3";
import { logger } from "../../config/logger";

const uploadBodySchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  base64: z.string().min(1),
  folder: z.enum(["products", "audio"]).default("products")
});

const MAX_BYTES = 10 * 1024 * 1024;

function safeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

export async function uploadAdminMedia(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = uploadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join("; "),
        code: "VALIDATION_ERROR"
      });
      return;
    }

    const { filename, contentType, base64, folder } = parsed.data;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch {
      res.status(400).json({ success: false, error: "Invalid file data", code: "INVALID_FILE" });
      return;
    }

    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      res.status(400).json({
        success: false,
        error: `File must be between 1 byte and ${MAX_BYTES / (1024 * 1024)}MB`,
        code: "FILE_TOO_LARGE"
      });
      return;
    }

    const key = `media/${folder}/${Date.now()}-${safeFilename(filename)}`;
    const url = await uploadAsset(key, buffer, contentType);
    if (!url) {
      res.status(503).json({
        success: false,
        error: "S3 upload is not configured on the server (check AWS env vars)",
        code: "S3_UNAVAILABLE"
      });
      return;
    }

    logger.info("admin_media_uploaded", { key, folder, bytes: buffer.length });
    res.json({ success: true, data: { url, key } });
  } catch (err) {
    next(err);
  }
}
