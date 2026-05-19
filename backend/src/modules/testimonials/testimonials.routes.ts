import { Router } from "express";

import { listTestimonialsHandler } from "./testimonials.controller";

export const testimonialsRoutes = Router();

testimonialsRoutes.get("/", listTestimonialsHandler);
