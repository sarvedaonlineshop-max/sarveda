import type { DigitalAccessStatus } from "@prisma/client";
import type { Request, Response, NextFunction } from "express";

import {
  listCourseEnrollments,
  listCoursesForEnrollmentFilter
} from "./enrollments.service";

function parseStatus(raw: unknown): DigitalAccessStatus | "ALL" | undefined {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "ACTIVE" || s === "CANCELLED") return s;
  if (s === "ALL") return "ALL";
  return undefined;
}

export async function courseEnrollmentsList(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const courseId = String(req.query.courseId ?? "").trim() || undefined;
    const q = String(req.query.q ?? "").trim() || undefined;
    const status = parseStatus(req.query.status);

    const data = await listCourseEnrollments({
      page,
      limit,
      courseId,
      q,
      status
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function courseEnrollmentsCourses(req: Request, res: Response, next: NextFunction) {
  try {
    const courses = await listCoursesForEnrollmentFilter();
    res.json({ success: true, data: { courses } });
  } catch (err) {
    next(err);
  }
}
