import type { NextFunction, Request, Response } from "express";

import { getCategoryTree } from "./categories.service";

export async function tree(_req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await getCategoryTree();
    res.json({ success: true, data: { categories } });
  } catch (err) {
    next(err);
  }
}
