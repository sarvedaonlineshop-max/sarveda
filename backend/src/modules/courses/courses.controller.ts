import type { Request, Response, NextFunction } from "express";

import {
  getCourseBySlug,
  listCourseSlugs,
  listPublishedCourses,
  prepareCourseCheckoutVariant
} from "./courses.service";

export async function listCoursesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const courses = await listPublishedCourses();
    res.json({ success: true, data: { courses } });
  } catch (err) {
    next(err);
  }
}

export async function getCourseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    if (!slug) {
      res.status(400).json({ success: false, error: "slug required", code: "BAD_REQUEST" });
      return;
    }
    const course = await getCourseBySlug(slug);
    if (!course) {
      res.status(404).json({ success: false, error: "Course not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { course } });
  } catch (err) {
    next(err);
  }
}

export async function prepareCourseCheckoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    if (!slug) {
      res.status(400).json({ success: false, error: "slug required", code: "BAD_REQUEST" });
      return;
    }
    const prepared = await prepareCourseCheckoutVariant(slug);
    if (!prepared) {
      res.status(400).json({
        success: false,
        error: "Course is not available for online checkout",
        code: "CHECKOUT_UNAVAILABLE"
      });
      return;
    }
    res.json({ success: true, data: prepared });
  } catch (err) {
    next(err);
  }
}

export async function courseSlugsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const slugs = await listCourseSlugs();
    res.json({ success: true, data: { slugs } });
  } catch (err) {
    next(err);
  }
}
