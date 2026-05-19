import type { Request, Response, NextFunction } from "express";

import { getMentorBySlug, listActiveMentors, listMentorSlugs } from "./mentors.service";

export async function listMentorsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const mentors = await listActiveMentors();
    res.json({ success: true, data: { mentors } });
  } catch (err) {
    next(err);
  }
}

export async function getMentorHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    const mentor = await getMentorBySlug(slug);
    if (!mentor) {
      res.status(404).json({ success: false, error: "Mentor not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { mentor } });
  } catch (err) {
    next(err);
  }
}

export async function mentorSlugsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const slugs = await listMentorSlugs();
    res.json({ success: true, data: { slugs } });
  } catch (err) {
    next(err);
  }
}
