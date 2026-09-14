import https from "https";
import type { IncomingHttpHeaders } from "http";
import { Router, type NextFunction, type Request, type Response } from "express";

import { logger } from "../../config/logger";

const router = Router();

const S3_HOST = "sarveda-media.s3.amazonaws.com";
const DO_IP = process.env.LEGACY_WP_MEDIA_IP?.trim() || "134.209.146.175";

function sanitizeRelPath(raw: string): string | null {
  const rel = decodeURIComponent(raw).replace(/^\/+/, "");
  if (!rel || rel.includes("..") || rel.includes("\\")) return null;
  if (!/^[A-Za-z0-9._\-\/]+$/.test(rel)) return null;
  return rel;
}

function fetchHttps(
  hostname: string,
  path: string,
  opts?: { servername?: string; headers?: Record<string, string> }
): Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method: "GET",
        servername: opts?.servername,
        headers: opts?.headers,
        timeout: 25000
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 502,
            headers: res.headers,
            body: Buffer.concat(chunks)
          })
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("upstream timeout"));
    });
    req.end();
  });
}

/**
 * Mounted at `/api/media/legacy-uploads`.
 * Tries S3 `media/wp/uploads/...`, then DigitalOcean WP (Host: sarveda.com).
 */
router.get(/.*/, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rel = sanitizeRelPath(req.path);
    if (!rel) {
      res.status(400).json({ success: false, error: "Invalid path", code: "BAD_REQUEST" });
      return;
    }

    let upstream = await fetchHttps(S3_HOST, `/media/wp/uploads/${rel}`).catch(() => null);

    if (!upstream || upstream.status >= 400) {
      upstream = await fetchHttps(DO_IP, `/wp-content/uploads/${rel}`, {
        servername: "sarveda.com",
        headers: { Host: "sarveda.com" }
      });
    }

    if (upstream.status >= 400) {
      logger.warn("legacy_upload_miss", { rel, status: upstream.status });
      res.status(404).json({ success: false, error: "Not found", code: "NOT_FOUND" });
      return;
    }

    const contentType = String(upstream.headers["content-type"] || "application/octet-stream");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    if (upstream.headers["content-length"]) {
      res.setHeader("Content-Length", String(upstream.headers["content-length"]));
    }
    res.status(200).send(upstream.body);
  } catch (err) {
    next(err);
  }
});

export const legacyUploadsRoutes = router;
