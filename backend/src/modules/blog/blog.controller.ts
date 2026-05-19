import type { Request, Response, NextFunction } from "express";

import { getPostBySlug, listPostSlugs, listPublishedPosts } from "./blog.service";

export async function listPostsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const posts = await listPublishedPosts();
    res.json({ success: true, data: { posts } });
  } catch (err) {
    next(err);
  }
}

export async function getPostHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    if (!slug) {
      res.status(400).json({ success: false, error: "slug required", code: "BAD_REQUEST" });
      return;
    }
    const post = await getPostBySlug(slug);
    if (!post) {
      res.status(404).json({ success: false, error: "Post not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { post } });
  } catch (err) {
    next(err);
  }
}

export async function postSlugsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const slugs = await listPostSlugs();
    res.json({ success: true, data: { slugs } });
  } catch (err) {
    next(err);
  }
}
