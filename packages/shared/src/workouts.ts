import { z } from "zod";
import { weeklyGoalStatusSchema } from "./weekly-goal.js";
import { restSecSchema } from "./progression.js";

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

const isoDateTimeField = () =>
  z.iso.datetime({ offset: true, error: "Use an ISO 8601 date-time, e.g. 2026-11-10T07:30:00Z." });

export const workoutSetInputSchema = z.object({
  /**
   * When the set was ticked on the phone. Optional only so workouts queued by older app
   * versions (Milestone 4b) still sync; current apps always send it.
   */
  completedAt: isoDateTimeField().optional(),
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
  /** Rest used between this exercise's sets. Optional for workouts from older app versions. */
  restSec: restSecSchema.optional(),
  /** True when the PLAYER changed the rest: it becomes their preference for this exercise. */
  saveRestAsPreference: z.boolean().optional(),
  // In the order performed. The server numbers them; the client never sends setOrder.
  sets: z.array(workoutSetInputSchema).min(1, "Each exercise needs at least one set."),
});

const isoDateTime = isoDateTimeField();

/**
 * The WHOLE workout, sent once when the player taps Finish (see the decision log).
 * `clientId` is a UUID the app generates when the workout STARTS, so every retry of
 * Finish carries the same id and the server can recognise a repeat.
 */
export const finishWorkoutSchema = z
  .object({
    clientId: z.uuid("clientId must be a UUID."),
    name: z.string().trim().min(1).max(WORKOUT_NAME_MAX).optional(),
    /** The routine it was started from. Ignored if that routine is gone or isn't yours. */
    routineId: z.uuid().optional(),
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

    // A set can't be completed before the workout started or after it finished.
    workout.exercises.forEach((exercise, e) =>
      exercise.sets.forEach((set, s) => {
        if (set.completedAt === undefined) return;
        const at = Date.parse(set.completedAt);
        if (at < startedAt || at > finishedAt + CLOCK_SKEW_TOLERANCE_MS) {
          ctx.addIssue({
            code: "custom",
            path: ["exercises", e, "sets", s, "completedAt"],
            message: "A set must be completed during the workout.",
          });
        }
      }),
    );

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

/**
 * An exercise as the app sees it, including the XP tuning values: the app uses them only
 * to show live XP during a workout; the server recomputes everything at Finish.
 */
export const exerciseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  muscleGroup: z.string(),
  bodyPart: bodyPartSchema,
  equipment: equipmentSchema,
  repsUnit: repsUnitSchema,
  mechanic: mechanicSchema,
  suggestedRestSec: z.number().int(),
  loadFactor: z.number(),
  bodyweightRatio: z.number(),
  isCustom: z.boolean(),
  /** The player's own rest time for this exercise (highest priority), or null. */
  restPreferenceSec: z.number().int().nullable(),
});
export type Exercise = z.infer<typeof exerciseSchema>;

/** Query of GET /exercises. Each search word must match the name or the muscle group. */
export const listExercisesQuerySchema = z.object({
  search: z.string().trim().max(60).optional(),
  bodyPart: bodyPartSchema.optional(),
});
export type ListExercisesQuery = z.infer<typeof listExercisesQuerySchema>;

/** Body of POST /exercises: a custom exercise. The server picks its XP tuning values. */
export const createExerciseSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(40, "Name must be at most 40 characters."),
  muscleGroup: z.string().trim().min(2, "Muscle group must be at least 2 characters.").max(40),
  bodyPart: bodyPartSchema,
  equipment: equipmentSchema,
  mechanic: mechanicSchema,
  repsUnit: repsUnitSchema.default("reps"),
});
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

/** Response of GET /exercises. */
export const exerciseListSchema = z.object({ items: z.array(exerciseSchema) });
export type ExerciseList = z.infer<typeof exerciseListSchema>;

export const workoutSetSchema = z.object({
  id: z.uuid(),
  setOrder: z.number().int(),
  completedAt: z.iso.datetime().nullable(),
  reps: z.number().int(),
  weightKg: z.number(),
});
export type WorkoutSet = z.infer<typeof workoutSetSchema>;

export const workoutExerciseSchema = z.object({
  id: z.uuid(),
  order: z.number().int(),
  exercise: exerciseSchema,
  restSec: z.number().int().nullable(),
  sets: z.array(workoutSetSchema),
});
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;

/** Response of POST /workouts and GET /workouts/:id. */
export const workoutDetailSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  name: z.string().nullable(),
  routineId: z.uuid().nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  exercises: z.array(workoutExerciseSchema),
});
export type WorkoutDetail = z.infer<typeof workoutDetailSchema>;

const sessionStatsSchema = z.object({
  durationSec: z.number().int(),
  setCount: z.number().int(),
  volumeKg: z.number(), // reps x lifted kg; timed exercises excluded
});

/**
 * The workout summary: what Finish earned and how it compares. Calculated from saved
 * data (never stored), so a repeated Finish returns exactly the same summary.
 */
export const finishSummarySchema = z.object({
  xp: z.object({
    sets: z.number().int(),
    /** The weekly bonus, when THIS workout met the week's goal. */
    weeklyGoal: z.number().int(),
    /** A streak milestone (12, 26, 52 weeks) reached by meeting the goal with this workout. */
    streakMilestone: z.number().int(),
    total: z.number().int(),
  }),
  /** Total XP before and after; the app draws the level bar with levelProgress(). */
  level: z.object({
    before: z.number().int(),
    after: z.number().int(),
    totalXpBefore: z.number().int(),
    totalXpAfter: z.number().int(),
  }),
  stats: sessionStatsSchema.extend({
    /** The previous workout of the same routine (or any previous workout); null if none. */
    previous: sessionStatsSchema.nullable(),
  }),
  /** The goal of the week this workout started in, as of this workout (later workouts not counted); null if that week has no goal row. */
  weeklyGoal: weeklyGoalStatusSchema.nullable(),
  prs: z.array(
    z.object({
      exerciseId: z.uuid(),
      exerciseName: z.string(),
      kind: z.enum(["e1rm", "reps_at_weight", "longest_hold"]),
      value: z.number(), // kg (lifted, bodyweight included) / reps / seconds
      previousValue: z.number(),
    }),
  ),
  /** The bodyweight used for this workout's XP and records (for "BW + x kg"). */
  bodyweightKg: z.number(),
});
export type FinishSummary = z.infer<typeof finishSummarySchema>;

/** Response of POST /workouts (201 saved now, 200 a repeat) and GET /workouts/:id/summary's parts. */
export const finishWorkoutResponseSchema = z.object({ workout: workoutDetailSchema, summary: finishSummarySchema });
export type FinishWorkoutResponse = z.infer<typeof finishWorkoutResponseSchema>;

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

// --- Exercise history (GET /exercises/:id/summary, GET /exercises/recent) ---------

const loggedSetSchema = z.object({ reps: z.number().int(), weightKg: z.number() });

/** One past workout's sets of an exercise. weightKg is as logged; loads include bodyweight. */
export const exerciseSessionSchema = z.object({
  workoutId: z.uuid(),
  startedAt: z.iso.datetime(),
  /** Bodyweight in effect that day, for showing bodyweight sets as "BW + x kg". */
  bodyweightKg: z.number(),
  sets: z.array(loggedSetSchema),
  bestE1rm: z.number().nullable(),
  volumeKg: z.number(),
  topSet: loggedSetSchema.nullable(),
});
export type ExerciseSession = z.infer<typeof exerciseSessionSchema>;

const recordAtDate = <T extends z.ZodRawShape>(shape: T) => z.object({ ...shape, date: z.iso.datetime() }).nullable();

/** Response of GET /exercises/:id/summary. Records are calculated on read from logged sets. */
export const exerciseSummarySchema = z.object({
  exercise: exerciseSchema,
  /** The player's current bodyweight (latest entry, or the 75 kg fallback). */
  bodyweightKg: z.number(),
  previousSession: exerciseSessionSchema.nullable(),
  records: z.object({
    bestE1rm: recordAtDate({ value: z.number(), reps: z.number().int(), weightKg: z.number() }),
    heaviestSet: recordAtDate({ reps: z.number().int(), weightKg: z.number(), loadKg: z.number() }),
    bestSessionVolume: recordAtDate({ volumeKg: z.number() }),
    /** Most reps in one set; for timed exercises, the longest hold in seconds. */
    mostReps: recordAtDate({ reps: z.number().int(), weightKg: z.number() }),
  }),
  /** Newest first, for the trend chart. */
  sessions: z.array(exerciseSessionSchema),
});
export type ExerciseSummary = z.infer<typeof exerciseSummarySchema>;

export const exerciseSummaryQuerySchema = z.object({
  sessions: z.coerce.number().int().min(1).max(100).default(8),
});
export type ExerciseSummaryQuery = z.infer<typeof exerciseSummaryQuerySchema>;

/** Response of GET /exercises/recent: "Recently used" in the Add exercise sheet. */
export const recentExerciseListSchema = z.object({
  items: z.array(z.object({ exercise: exerciseSchema, lastDoneAt: z.iso.datetime(), lastSets: z.array(loggedSetSchema) })),
});
export type RecentExerciseList = z.infer<typeof recentExerciseListSchema>;
