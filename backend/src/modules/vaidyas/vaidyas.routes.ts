import { Router } from "express";

import { getVaidyaHandler, listVaidyasHandler, vaidyaSlugsHandler } from "./vaidyas.controller";

export const vaidyasRoutes = Router();

vaidyasRoutes.get("/", listVaidyasHandler);
vaidyasRoutes.get("/sitemap/slugs", vaidyaSlugsHandler);
vaidyasRoutes.get("/:slug", getVaidyaHandler);
