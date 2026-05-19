import { Router } from "express";

import { eventSlugsHandler, getEventHandler, listEventsHandler } from "./events.controller";

export const eventsRoutes = Router();

eventsRoutes.get("/", listEventsHandler);
eventsRoutes.get("/sitemap/slugs", eventSlugsHandler);
eventsRoutes.get("/:slug", getEventHandler);
