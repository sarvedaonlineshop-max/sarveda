import type { NextFunction, Request, Response } from "express";

import type { ContentCreateBody, ContentType, ContentUpdateBody } from "./content.types";
import { isContentType } from "./content.types";
import * as contentService from "./content.service";

function parseType(req: Request): ContentType {
  const type = req.params.type;
  if (!type || !isContentType(type)) {
    const err = new Error("Invalid content type") as Error & { statusCode: number; code: string };
    err.statusCode = 404;
    err.code = "NOT_FOUND";
    throw err;
  }
  return type;
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const type = parseType(req);
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const data = await contentService.listContent(type, {
      page: Number.isFinite(page) ? page : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
      q
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const type = parseType(req);
    const data = await contentService.getContent(type, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const type = parseType(req);
    const data = await contentService.createContent(type, req.body as ContentCreateBody);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const type = parseType(req);
    const data = await contentService.updateContent(
      type,
      req.params.id,
      req.body as ContentUpdateBody
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const type = parseType(req);
    const data = await contentService.deleteContent(type, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
