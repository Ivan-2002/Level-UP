import { z } from "zod";
import { REST_MAX_SEC, REST_MIN_SEC, REST_STEP_SEC } from "./progression.js";
import { exerciseSchema, REPS_MAX } from "./workouts.js";

// ---------------------------------------------------------------------------
// Routines: saved plans. A workout COPIES a routine's exercises when it starts, so
// editing a routine later never changes history.
// ---------------------------------------------------------------------------

export const ROUTINE_NAME_MAX = 60;
export const ROUTINE_MAX_EXERCISES = 20;
export const TARGET_SETS_MAX = 10;

export const restSecSchema = z
  .number({ error: "Rest must be a number of seconds." })
  .int()
  .min(REST_MIN_SEC, `Rest must be at least ${REST_MIN_SEC} seconds.`)
  .max(REST_MAX_SEC, `Rest must be at most ${REST_MAX_SEC / 60} minutes.`)
  .multipleOf(REST_STEP_SEC, `Rest goes up in steps of ${REST_STEP_SEC} seconds.`);

export const routineExerciseInputSchema = z.object({
  exerciseId: z.uuid("Unknown exercise."),
  targetSets: z.number().int().min(1, "At least 1 set.").max(TARGET_SETS_MAX, `At most ${TARGET_SETS_MAX} sets.`),
  targetReps: z.number().int().min(1, "At least 1 rep.").max(REPS_MAX, `At most ${REPS_MAX} reps.`),
  /** null or missing = use the exercise's suggestion (or the player's own preference). */
  restSec: restSecSchema.nullable().optional(),
});

/** Body of POST /routines and PUT /routines/:id (PUT replaces the whole routine). */
export const routineInputSchema = z.object({
  name: z.string().trim().min(1, "Give the routine a name.").max(ROUTINE_NAME_MAX),
  // In order. The server numbers them, as for workouts.
  exercises: z
    .array(routineExerciseInputSchema)
    .min(1, "Add at least one exercise.")
    .max(ROUTINE_MAX_EXERCISES, `A routine can have at most ${ROUTINE_MAX_EXERCISES} exercises.`),
});
export type RoutineInput = z.infer<typeof routineInputSchema>;

export const routineExerciseSchema = z.object({
  id: z.uuid(),
  order: z.number().int(),
  exercise: exerciseSchema,
  targetSets: z.number().int(),
  targetReps: z.number().int(),
  restSec: z.number().int().nullable(),
});
export type RoutineExercise = z.infer<typeof routineExerciseSchema>;

/** Response of GET /routines/:id, POST /routines and PUT /routines/:id. */
export const routineSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  lastDoneAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  exercises: z.array(routineExerciseSchema),
});
export type Routine = z.infer<typeof routineSchema>;

export const routineSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  exerciseCount: z.number().int(),
  lastDoneAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export type RoutineSummary = z.infer<typeof routineSummarySchema>;

/** Response of GET /routines, in the order the player created them. */
export const routineListSchema = z.object({ items: z.array(routineSummarySchema) });
export type RoutineList = z.infer<typeof routineListSchema>;
