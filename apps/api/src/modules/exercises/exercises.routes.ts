import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import * as controller from "./exercises.controller.js";

// The exercise library. Read-only for now; custom exercises (POST) come after the MVP.
export const exercisesRouter = Router();

exercisesRouter.get("/exercises", requireAuth, controller.listExercises);
