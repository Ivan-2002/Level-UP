import type { ExerciseTuning } from "../src/progression.js";
import type { BodyPart, Equipment, Mechanic, RepsUnit } from "../src/workouts.js";

// The exercises the simulated players use, copied from the API's exercise catalog
// (apps/api/src/modules/exercises/exercise-catalog.ts): XP tuning plus what the
// plausibility limits depend on.
//
// Why a copy: @levelup/shared must never import from apps/api (dependencies only point
// TOWARDS shared). The API has a test that fails if any value here stops matching the
// catalog, so the copy can't drift silently.

export type SimExercise = ExerciseTuning & {
  /** The avatar body part it grows (development). */
  bodyPart: BodyPart;
  equipment: Equipment;
  mechanic: Mechanic;
  repsUnit: RepsUnit;
  maxPlausibleWeightKg: number | null;
  maxPlausibleReps: number | null;
};

const x = (
  bodyPart: BodyPart,
  equipment: Equipment,
  mechanic: Mechanic,
  loadFactor: number,
  bodyweightRatio = 0,
  repsUnit: RepsUnit = "reps",
  maxPlausibleWeightKg: number | null = null,
): SimExercise => ({
  bodyPart,
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
  "barbell-back-squat": x("legs", "barbell", "compound", 1, 0, "reps", 450),
  "romanian-deadlift": x("legs", "barbell", "compound", 1.1),
  "leg-press": x("legs", "machine", "compound", 0.5, 0, "reps", 500),
  "leg-extension": x("legs", "machine", "isolation", 1.3),
  "lying-leg-curl": x("legs", "machine", "isolation", 1.7),
  "walking-lunge": x("legs", "dumbbell", "compound", 0.9, 0.75),
  "standing-calf-raise": x("legs", "machine", "isolation", 0.7, 0, "reps", 300),
  // Back
  deadlift: x("back", "barbell", "compound", 1.2, 0, "reps", 450),
  "pull-up": x("back", "bodyweight", "compound", 1.25, 1),
  "lat-pulldown": x("back", "cable", "compound", 1.3),
  "barbell-row": x("back", "barbell", "compound", 1.4),
  // Chest
  "barbell-bench-press": x("chest", "barbell", "compound", 1.25),
  "incline-dumbbell-press": x("chest", "dumbbell", "compound", 3),
  "cable-fly": x("chest", "cable", "isolation", 4.5),
  "push-up": x("chest", "bodyweight", "compound", 0.8, 0.65),
  // Shoulders
  "overhead-press": x("shoulders", "barbell", "compound", 2),
  "lateral-raise": x("shoulders", "dumbbell", "isolation", 5),
  "face-pull": x("shoulders", "cable", "isolation", 2),
  // Arms
  "barbell-curl": x("arms", "barbell", "isolation", 2.3),
  "dumbbell-curl": x("arms", "dumbbell", "isolation", 5),
  "triceps-pushdown": x("arms", "cable", "isolation", 2.2),
  "skull-crusher": x("arms", "barbell", "isolation", 2.7),
  dip: x("arms", "bodyweight", "compound", 1, 0.95),
  // Core
  plank: x("core", "bodyweight", "isolation", 0.35, 0.5, "seconds"),
  "hanging-leg-raise": x("core", "bodyweight", "isolation", 2.4, 0.35),
} as const satisfies Record<string, SimExercise>;

export type SimExerciseSlug = keyof typeof SIM_EXERCISES;
