import { Router } from "express";

import {
  courseSlugsHandler,
  getCourseHandler,
  listCoursesHandler,
  prepareCourseCheckoutHandler
} from "./courses.controller";

export const coursesRoutes = Router();

coursesRoutes.get("/", listCoursesHandler);
coursesRoutes.get("/sitemap/slugs", courseSlugsHandler);
coursesRoutes.post("/:slug/prepare-checkout", prepareCourseCheckoutHandler);
coursesRoutes.get("/:slug", getCourseHandler);
