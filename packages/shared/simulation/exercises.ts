import type { ExerciseTuning } from "../src/progression.js";
import type { Equipment, Mechanic, RepsUnit } from "../src/workouts.js";

// The exercises the simulated players use, copied from the API's exercise catalog
// (apps/api/src/modules/exercises/exercise-catalog.ts): XP tuning plus what the
// plausibility limits depend on.
//
// Why a copy: @levelup/shared must never import from apps/api (dependencies only point
// TOWARDS shared). The API has a test that fails if any value here stops matching the
// catalog, so the copy can't drift silently.

export type SimExercise = ExerciseTuning & {
  equipment: Equipment;
  mechanic: Mechanic;
  repsUnit: RepsUnit;
  maxPlausibleWeightKg: number | null;
  maxPlausibleReps: number | null;
};

const x = (
  equipment: Equipment,
  mechanic: Mechanic,
  loadFactor: number,
  bodyweightRatio = 0,
  repsUnit: RepsUnit = "reps",
  maxPlausibleWeightKg: number | null = null,
): SimExercise => ({
  equipment,
  mechanic,
  loadFactor,
  bodyweightRatio,
  repsUnit,
  maxPlausibleWeightKg,
  maxPlausibleReps: null,
});

export const SIM_EXERCISES = {
  // Legs
  "barbell-back-squat": x("barbell", "compound", 1, 0, "reps", 450),
  "romanian-deadlift": x("barbell", "compound", 1.1),
  "leg-press": x("machine", "compound", 0.5, 0, "reps", 500),
  "leg-extension": x("machine", "isolation", 1.3),
  "lying-leg-curl": x("machine", "isolation", 1.7),
  "walking-lunge": x("dumbbell", "compound", 0.9, 0.75),
  "standing-calf-raise": x("machine", "isolation", 0.7, 0, "reps", 300),
  // Back
  deadlift: x("barbell", "compound", 1.2, 0, "reps", 450),
  "pull-up": x("bodyweight", "compound", 1.25, 1),
  "lat-pulldown": x("cable", "compound", 1.3),
  "barbell-row": x("barbell", "compound", 1.4),
  // Chest
  "barbell-bench-press": x("barbell", "compound", 1.25),
  "incline-dumbbell-press": x("dumbbell", "compound", 3),
  "cable-fly": x("cable", "isolation", 4.5),
  "push-up": x("bodyweight", "compound", 0.8, 0.65),
  // Shoulders
  "overhead-press": x("barbell", "compound", 2),
  "lateral-raise": x("dumbbell", "isolation", 5),
  "face-pull": x("cable", "isolation", 2),
  // Arms
  "barbell-curl": x("barbell", "isolation", 2.3),
  "dumbbell-curl": x("dumbbell", "isolation", 5),
  "triceps-pushdown": x("cable", "isolation", 2.2),
  "skull-crusher": x("barbell", "isolation", 2.7),
  dip: x("bodyweight", "compound", 1, 0.95),
  // Core
  plank: x("bodyweight", "isolation", 0.35, 0.5, "seconds"),
  "hanging-leg-raise": x("bodyweight", "isolation", 2.4, 0.35),
} as const satisfies Record<string, SimExercise>;

export type SimExerciseSlug = keyof typeof SIM_EXERCISES;
