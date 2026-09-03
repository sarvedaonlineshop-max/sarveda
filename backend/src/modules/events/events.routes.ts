import { Router } from "express";

import {
  eventSlugsHandler,
  getEventHandler,
  listEventsHandler,
  prepareEventCheckoutHandler
} from "./events.controller";

export const eventsRoutes = Router();

eventsRoutes.get("/", listEventsHandler);
eventsRoutes.get("/sitemap/slugs", eventSlugsHandler);
eventsRoutes.post("/:slug/prepare-checkout", prepareEventCheckoutHandler);
eventsRoutes.get("/:slug", getEventHandler);
