import type { ExerciseTuning } from "../src/progression.js";
import type { RepsUnit } from "../src/workouts.js";

// The XP tuning of the exercises the simulated players use, copied from the API's
// exercise catalog (apps/api/src/modules/exercises/exercise-catalog.ts).
//
// Why a copy: @levelup/shared must never import from apps/api (dependencies only point
// TOWARDS shared). The API has a test that fails if any value here stops matching the
// catalog, so the copy can't drift silently.

export type SimExercise = ExerciseTuning & { repsUnit: RepsUnit };

const loaded = (loadFactor: number): SimExercise => ({ loadFactor, bodyweightRatio: 0, repsUnit: "reps" });
const bodyweight = (loadFactor: number, bodyweightRatio: number, repsUnit: RepsUnit = "reps"): SimExercise => ({
  loadFactor,
  bodyweightRatio,
  repsUnit,
});

export const SIM_EXERCISES = {
  // Legs
  "barbell-back-squat": loaded(1),
  "romanian-deadlift": loaded(1.1),
  "leg-press": loaded(0.5),
  "leg-extension": loaded(1.3),
  "lying-leg-curl": loaded(1.7),
  "walking-lunge": bodyweight(0.9, 0.75),
  "standing-calf-raise": loaded(0.7),
  // Back
  deadlift: loaded(1.2),
  "pull-up": bodyweight(1.25, 1),
  "lat-pulldown": loaded(1.3),
  "barbell-row": loaded(1.4),
  // Chest
  "barbell-bench-press": loaded(1.25),
  "incline-dumbbell-press": loaded(3),
  "cable-fly": loaded(4.5),
  "push-up": bodyweight(0.8, 0.65),
  // Shoulders
  "overhead-press": loaded(2),
  "lateral-raise": loaded(5),
  "face-pull": loaded(2),
  // Arms
  "barbell-curl": loaded(2.3),
  "dumbbell-curl": loaded(5),
  "triceps-pushdown": loaded(2.2),
  "skull-crusher": loaded(2.7),
  dip: bodyweight(1, 0.95),
  // Core
  plank: bodyweight(0.35, 0.5, "seconds"),
  "hanging-leg-raise": bodyweight(2.4, 0.35),
} as const satisfies Record<string, SimExercise>;

export type SimExerciseSlug = keyof typeof SIM_EXERCISES;
