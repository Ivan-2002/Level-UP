import { z } from "zod";
import { formatWeight, type WeightUnit } from "./units.js";
import { HOLD_MAX_SEC, type Equipment, type Mechanic, type RepsUnit } from "./workouts.js";

// ---------------------------------------------------------------------------
// Limits against fake or inflated workouts (docs/ARCHITECTURE.md, "Limits against fake
// or inflated workouts"). Pure rules; the server applies them at Finish and is the only
// one that awards anything. The app runs the same rules to preview XP honestly.
//
// This file grows through Milestone 5: plausibility limits (here), then the jump cap
// against the player's own history, the daily cap and the 14-day rule.
// ---------------------------------------------------------------------------

// --- Plausibility: absolute limits per exercise --------------------------------------
//
// A set far beyond what any human lifts for that exercise is almost always a typo (80
// typed as 800 is caught by the 500 kg schema limit; 300 kg on a lateral raise isn't).
// It is FLAGGED, not rejected: the workout still saves, the set earns no XP and isn't a
// PR, and the summary says why. Rejecting would make the outbox retry a typo forever.
//
// The limits are on the LOGGED weight: per dumbbell for dumbbell lifts, and the ADDED
// weight for bodyweight exercises (a pull-up's own bodyweight is never "too heavy").
// They sit around elite level on purpose: the goal is catching typos, never doubting a
// strong honest lifter. The daily cap and the jump cap handle the rest.

export type PlausibilityLimits = { maxWeightKg: number; maxReps: number };

/**
 * Defaults by equipment and mechanic. Built-in exercises can override them (an exercise's
 * own columns, from Milestone 5 Phase 2): a leg press moves far more than a chest press,
 * although both are machine compounds. Custom exercises always use these defaults.
 */
export const DEFAULT_PLAUSIBILITY: Record<Equipment, Record<Mechanic, PlausibilityLimits>> = {
  barbell: { compound: { maxWeightKg: 350, maxReps: 50 }, isolation: { maxWeightKg: 120, maxReps: 60 } },
  dumbbell: { compound: { maxWeightKg: 80, maxReps: 60 }, isolation: { maxWeightKg: 50, maxReps: 60 } },
  machine: { compound: { maxWeightKg: 300, maxReps: 60 }, isolation: { maxWeightKg: 200, maxReps: 60 } },
  cable: { compound: { maxWeightKg: 200, maxReps: 60 }, isolation: { maxWeightKg: 120, maxReps: 60 } },
  kettlebell: { compound: { maxWeightKg: 100, maxReps: 100 }, isolation: { maxWeightKg: 48, maxReps: 60 } },
  bodyweight: { compound: { maxWeightKg: 100, maxReps: 100 }, isolation: { maxWeightKg: 50, maxReps: 100 } },
};

/** What the plausibility check needs to know about an exercise. Overrides are null when unset. */
export type PlausibilityExercise = {
  equipment: Equipment;
  mechanic: Mechanic;
  repsUnit: RepsUnit;
  maxPlausibleWeightKg?: number | null;
  maxPlausibleReps?: number | null;
};

/**
 * The limits for one exercise: its own override where it has one, else the equipment x
 * mechanic default. Timed exercises are never flagged for duration: their maximum is the
 * hard 600 s limit (HOLD_MAX_SEC), which the server already enforces.
 */
export function plausibilityLimits(exercise: PlausibilityExercise): PlausibilityLimits {
  const fallback = DEFAULT_PLAUSIBILITY[exercise.equipment][exercise.mechanic];
  return {
    maxWeightKg: exercise.maxPlausibleWeightKg ?? fallback.maxWeightKg,
    maxReps: exercise.repsUnit === "seconds" ? HOLD_MAX_SEC : (exercise.maxPlausibleReps ?? fallback.maxReps),
  };
}

// --- Flag reasons --------------------------------------------------------------------
// Stored in workout_set.flag_reason as a code; the TEXT is built when it's shown, in the
// player's unit. A code (not a database enum) so adding a reason needs no migration.

export const FLAG_REASONS = ["weight_above_range", "reps_above_range"] as const;
export const flagReasonSchema = z.enum(FLAG_REASONS);
export type FlagReason = z.infer<typeof flagReasonSchema>;

/**
 * Why this set is implausible, or null if it isn't. A set over both limits reports the
 * weight (one reason per set; the weight is the likelier typo).
 */
export function plausibilityFlag(set: { reps: number; weightKg: number }, limits: PlausibilityLimits): FlagReason | null {
  if (set.weightKg > limits.maxWeightKg) return "weight_above_range";
  if (set.reps > limits.maxReps) return "reps_above_range";
  return null;
}

/** The sentence the summary shows for a flagged set, e.g. "320 kg is above the 300 kg limit for this exercise." */
export function flagReasonText(
  reason: FlagReason,
  set: { reps: number; weightKg: number },
  limits: PlausibilityLimits,
  weightUnit: WeightUnit,
): string {
  const outcome = "so this set earns no XP and doesn't count as a PR.";
  switch (reason) {
    case "weight_above_range":
      return `${formatWeight(set.weightKg, weightUnit)} is above the ${formatWeight(limits.maxWeightKg, weightUnit)} limit for this exercise, ${outcome}`;
    case "reps_above_range":
      return `${set.reps} reps is above the ${limits.maxReps}-rep limit for this exercise, ${outcome}`;
  }
}
