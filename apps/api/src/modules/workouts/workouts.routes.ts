import { Router } from "express";
import { finishWorkoutSchema, listWorkoutsQuerySchema } from "@levelup/shared";
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
