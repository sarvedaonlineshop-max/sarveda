import { Router } from "express";

import { getPostHandler, listPostsHandler, postSlugsHandler } from "./blog.controller";

export const blogRoutes = Router();

blogRoutes.get("/", listPostsHandler);
blogRoutes.get("/sitemap/slugs", postSlugsHandler);
blogRoutes.get("/:slug", getPostHandler);
