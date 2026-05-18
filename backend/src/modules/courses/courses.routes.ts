import { Router } from "express";

import { courseSlugsHandler, getCourseHandler, listCoursesHandler } from "./courses.controller";

export const coursesRoutes = Router();

coursesRoutes.get("/", listCoursesHandler);
coursesRoutes.get("/sitemap/slugs", courseSlugsHandler);
coursesRoutes.get("/:slug", getCourseHandler);
