import type { Request, Response, NextFunction } from "express";

import { listPublishedTestimonials } from "./testimonials.service";

export async function listTestimonialsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 12));
    const testimonials = await listPublishedTestimonials(limit);
    res.json({ success: true, data: { testimonials } });
  } catch (err) {
    next(err);
  }
}
