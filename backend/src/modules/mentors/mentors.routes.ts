import { Router } from "express";

import { getMentorHandler, listMentorsHandler, mentorSlugsHandler } from "./mentors.controller";

export const mentorsRoutes = Router();

mentorsRoutes.get("/", listMentorsHandler);
mentorsRoutes.get("/sitemap/slugs", mentorSlugsHandler);
mentorsRoutes.get("/:slug", getMentorHandler);
