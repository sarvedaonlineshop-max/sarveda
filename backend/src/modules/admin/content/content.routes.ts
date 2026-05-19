import { Router } from "express";

import { validateBody } from "../../../middleware/validate";

import * as contentController from "./content.controller";
import { contentCreateSchema, contentUpdateSchema } from "./content.schemas";

const router = Router({ mergeParams: true });

router.get("/", contentController.list);
router.get("/:id", contentController.getOne);
router.post("/", validateBody(contentCreateSchema), contentController.create);
router.patch("/:id", validateBody(contentUpdateSchema), contentController.update);
router.delete("/:id", contentController.remove);

export { router as contentRoutes };
