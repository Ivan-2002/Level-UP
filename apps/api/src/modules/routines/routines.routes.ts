import { Router } from "express";
import { routineInputSchema } from "@levelup/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateBody } from "../../middleware/validate.js";
import * as controller from "./routines.controller.js";

// Saved routines, always scoped to the signed-in player.
export const routinesRouter = Router();

routinesRouter.get("/routines", requireAuth, controller.listRoutines);
routinesRouter.post("/routines", requireAuth, validateBody(routineInputSchema), controller.createRoutine);
routinesRouter.get("/routines/:id", requireAuth, controller.getRoutine);
// PUT replaces the whole routine (name + exercises): the builder always edits all of it.
routinesRouter.put("/routines/:id", requireAuth, validateBody(routineInputSchema), controller.updateRoutine);
routinesRouter.delete("/routines/:id", requireAuth, controller.deleteRoutine);
