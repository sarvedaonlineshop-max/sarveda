import type { Request, Response, NextFunction } from "express";

import { getEventBySlug, listEventSlugs, listPublishedEvents } from "./events.service";

export async function listEventsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const events = await listPublishedEvents();
    res.json({ success: true, data: { events } });
  } catch (err) {
    next(err);
  }
}

export async function getEventHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    if (!slug) {
      res.status(400).json({ success: false, error: "slug required", code: "BAD_REQUEST" });
      return;
    }
    const event = await getEventBySlug(slug);
    if (!event) {
      res.status(404).json({ success: false, error: "Event not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { event } });
  } catch (err) {
    next(err);
  }
}

export async function eventSlugsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const slugs = await listEventSlugs();
    res.json({ success: true, data: { slugs } });
  } catch (err) {
    next(err);
  }
}
