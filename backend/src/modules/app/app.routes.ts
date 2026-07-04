import { Router } from "express";

import { prisma } from "../../config/db";
import { requireAdmin } from "../../middleware/admin";

const router = Router();

// GET /api/app/version?platform=android
// Public - no auth needed
router.get("/version", async (req, res, next) => {
  try {
    const platform =
      (req.query.platform as string) ?? "android";

    const latest = await prisma.appVersion.findFirst({
      where: { platform, isActive: true },
      orderBy: { versionCode: "desc" },
    });

    if (!latest) {
      res.json({
        version: "1.0.0",
        versionCode: 1,
        apkUrl: null,
        mandatory: false,
        releaseNotes: null,
        hasUpdate: false,
      });
      return;
    }

    res.json({
      version: latest.version,
      versionCode: latest.versionCode,
      apkUrl: latest.apkUrl,
      mandatory: latest.mandatory,
      releaseNotes: latest.releaseNotes,
      hasUpdate: true,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/app/version (admin only)
router.post("/version", requireAdmin, async (req, res, next) => {
  try {
    const {
      platform,
      version,
      versionCode,
      apkUrl,
      mandatory,
      releaseNotes,
    } = req.body as {
      platform?: string;
      version: string;
      versionCode: number;
      apkUrl: string;
      mandatory?: boolean;
      releaseNotes?: string;
    };

    const appVersion = await prisma.appVersion.create({
      data: {
        platform: platform ?? "android",
        version,
        versionCode,
        apkUrl,
        mandatory: mandatory ?? false,
        releaseNotes,
      },
    });

    res.json({ success: true, appVersion });
  } catch (err) {
    next(err);
  }
});

// GET /api/app/versions (admin only - list all)
router.get("/versions", requireAdmin, async (_req, res, next) => {
  try {
    const versions = await prisma.appVersion.findMany({
      orderBy: [{ platform: "asc" }, { versionCode: "desc" }],
    });
    res.json({ versions });
  } catch (err) {
    next(err);
  }
});

export default router;
