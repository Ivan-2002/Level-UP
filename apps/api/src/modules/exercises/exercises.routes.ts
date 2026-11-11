import { Router } from "express";
import { createExerciseSchema, listExercisesQuerySchema } from "@levelup/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import * as controller from "./exercises.controller.js";

// The exercise library: built-in exercises plus the player's own custom ones.
// (GET /exercises/recent and /exercises/:id/summary are built from workout history, so
// they live in the workouts module.)
export const exercisesRouter = Router();

exercisesRouter.get("/exercises", requireAuth, validateQuery(listExercisesQuerySchema), controller.listExercises);
exercisesRouter.post("/exercises", requireAuth, validateBody(createExerciseSchema), controller.createExercise);
