import { z } from "zod";

// ---------------------------------------------------------------------------
// Exercises and workouts (Milestone 4)
//
// Request schemas are used twice: the API validates with them, and the app validates
// before sending. Response schemas describe exactly what the API returns; API tests
// parse real responses with them, so the contract can't silently drift.
// ---------------------------------------------------------------------------

/** The avatar's six body parts. Every exercise trains exactly one. */
export const BODY_PARTS = ["chest", "back", "shoulders", "arms", "core", "legs"] as const;
export const bodyPartSchema = z.enum(BODY_PARTS);
export type BodyPart = z.infer<typeof bodyPartSchema>;

export const EQUIPMENT = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell"] as const;
export const equipmentSchema = z.enum(EQUIPMENT);
export type Equipment = z.infer<typeof equipmentSchema>;

/** Compound = several joints, heavy; isolation = one joint. Drives the suggested rest range. */
export const MECHANICS = ["compound", "isolation"] as const;
export const mechanicSchema = z.enum(MECHANICS);
export type Mechanic = z.infer<typeof mechanicSchema>;

/** What a set's `reps` number counts: repetitions, or seconds held (plank). */
export const REPS_UNITS = ["reps", "seconds"] as const;
export const repsUnitSchema = z.enum(REPS_UNITS);
export type RepsUnit = z.infer<typeof repsUnitSchema>;

// --- Limits (server-enforced; the app shows them as form hints) -------------

export const REPS_MIN = 1;
export const REPS_MAX = 100;
export const WEIGHT_MIN_KG = 0; // 0 = bodyweight only (push-ups) or an empty bar
export const WEIGHT_MAX_KG = 500;
export const MAX_SETS_PER_WORKOUT = 100;
export const MAX_WORKOUT_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours
export const WORKOUT_NAME_MAX = 60;
/** Phone clocks drift. A workout may "finish" up to this far in the server's future. */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

// --- Request: POST /workouts ("Finish workout") ------------------------------

export const workoutSetInputSchema = z.object({
  reps: z
    .number({ error: "Reps must be a number." })
    .int("Reps must be a whole number.")
    .min(REPS_MIN, `Reps must be at least ${REPS_MIN}.`)
    .max(REPS_MAX, `Reps must be at most ${REPS_MAX}.`),
  weightKg: z
    .number({ error: "Weight must be a number." })
    .min(WEIGHT_MIN_KG, "Weight can't be negative.")
    .max(WEIGHT_MAX_KG, `Weight must be at most ${WEIGHT_MAX_KG} kg.`),
});

export const workoutExerciseInputSchema = z.object({
  exerciseId: z.uuid("Unknown exercise."),
  // In the order performed. The server numbers them; the client never sends setOrder.
  sets: z.array(workoutSetInputSchema).min(1, "Each exercise needs at least one set."),
});

const isoDateTime = z.iso.datetime({ offset: true, error: "Use an ISO 8601 date-time, e.g. 2026-11-10T07:30:00Z." });

/**
 * The WHOLE workout, sent once when the player taps Finish (see the decision log).
 * `clientId` is a UUID the app generates when the workout STARTS, so every retry of
 * Finish carries the same id and the server can recognise a repeat.
 */
export const finishWorkoutSchema = z
  .object({
    clientId: z.uuid("clientId must be a UUID."),
    name: z.string().trim().min(1).max(WORKOUT_NAME_MAX).optional(),
    startedAt: isoDateTime,
    finishedAt: isoDateTime,
    // In the order performed. The server numbers them; the client never sends `order`.
    exercises: z.array(workoutExerciseInputSchema).min(1, "A workout needs at least one exercise."),
  })
  // Rules that compare fields with each other (or with "now") can't live on one field.
  .superRefine((workout, ctx) => {
    const startedAt = Date.parse(workout.startedAt);
    const finishedAt = Date.parse(workout.finishedAt);

    if (finishedAt <= startedAt) {
      ctx.addIssue({ code: "custom", path: ["finishedAt"], message: "A workout must finish after it starts." });
    } else if (finishedAt - startedAt > MAX_WORKOUT_DURATION_MS) {
      ctx.addIssue({ code: "custom", path: ["finishedAt"], message: "A workout can last at most 6 hours." });
    }
    if (finishedAt > Date.now() + CLOCK_SKEW_TOLERANCE_MS) {
      ctx.addIssue({ code: "custom", path: ["finishedAt"], message: "A workout can't finish in the future." });
    }

    const totalSets = workout.exercises.reduce((sum, e) => sum + e.sets.length, 0);
    if (totalSets > MAX_SETS_PER_WORKOUT) {
      ctx.addIssue({
        code: "custom",
        path: ["exercises"],
        message: `A workout can have at most ${MAX_SETS_PER_WORKOUT} sets (this one has ${totalSets}).`,
      });
    }
  });

export type FinishWorkoutInput = z.infer<typeof finishWorkoutSchema>;

// --- Request: GET /workouts query --------------------------------------------

export const WORKOUTS_PAGE_DEFAULT = 20;
export const WORKOUTS_PAGE_MAX = 50;

export const listWorkoutsQuerySchema = z.object({
  // Query strings are always text ("20"), so coerce to a number before checking.
  limit: z.coerce.number().int().min(1).max(WORKOUTS_PAGE_MAX).default(WORKOUTS_PAGE_DEFAULT),
  /** Opaque: pass back `nextCursor` from the previous page, never build one yourself. */
  cursor: z.string().min(1).optional(),
});
export type ListWorkoutsQuery = z.infer<typeof listWorkoutsQuerySchema>;

// --- Responses ---------------------------------------------------------------

/** An exercise as the app sees it. XP tuning values (loadFactor, bodyweightRatio) stay on the server. */
export const exerciseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  muscleGroup: z.string(),
  bodyPart: bodyPartSchema,
  equipment: equipmentSchema,
  repsUnit: repsUnitSchema,
});
export type Exercise = z.infer<typeof exerciseSchema>;

/** Response of GET /exercises. */
export const exerciseListSchema = z.object({ items: z.array(exerciseSchema) });
export type ExerciseList = z.infer<typeof exerciseListSchema>;

export const workoutSetSchema = z.object({
  id: z.uuid(),
  setOrder: z.number().int(),
  reps: z.number().int(),
  weightKg: z.number(),
});
export type WorkoutSet = z.infer<typeof workoutSetSchema>;

export const workoutExerciseSchema = z.object({
  id: z.uuid(),
  order: z.number().int(),
  exercise: exerciseSchema,
  sets: z.array(workoutSetSchema),
});
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;

/** Response of POST /workouts and GET /workouts/:id. */
export const workoutDetailSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  name: z.string().nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  exercises: z.array(workoutExerciseSchema),
});
export type WorkoutDetail = z.infer<typeof workoutDetailSchema>;

/** One row of the history list: enough to draw it without loading every set. */
export const workoutSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  exerciseCount: z.number().int(),
  setCount: z.number().int(),
});
export type WorkoutSummary = z.infer<typeof workoutSummarySchema>;

/** Response of GET /workouts. `nextCursor` is null on the last page. */
export const workoutPageSchema = z.object({
  items: z.array(workoutSummarySchema),
  nextCursor: z.string().nullable(),
});
export type WorkoutPage = z.infer<typeof workoutPageSchema>;
