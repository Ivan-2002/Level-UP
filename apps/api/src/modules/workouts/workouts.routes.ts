import { Router } from "express";
import { exerciseSummaryQuerySchema, finishWorkoutSchema, listWorkoutsQuerySchema } from "@levelup/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import * as controller from "./workouts.controller.js";

// Logged workouts. Every route needs a session; a user only ever sees their own workouts.
export const workoutsRouter = Router();

// "Finish workout": the whole workout in one request, idempotent by clientId.
workoutsRouter.post("/workouts", requireAuth, validateBody(finishWorkoutSchema), controller.finishWorkout);
// History, newest first: ?limit=20&cursor=<nextCursor from the previous page>
workoutsRouter.get("/workouts", requireAuth, validateQuery(listWorkoutsQuerySchema), controller.listWorkouts);
workoutsRouter.get("/workouts/:id", requireAuth, controller.getWorkout);
// The same summary Finish returned, recalculated from saved data.
workoutsRouter.get("/workouts/:id/summary", requireAuth, controller.getWorkoutSummary);

// Exercise history is built from workouts, so these live here even though their URLs
// start with /exercises (modules own data and rules, not URL prefixes).
workoutsRouter.get("/exercises/recent", requireAuth, controller.recentExercises);
workoutsRouter.get(
  "/exercises/:id/summary",
  requireAuth,
  validateQuery(exerciseSummaryQuerySchema),
  controller.exerciseSummary,
);
