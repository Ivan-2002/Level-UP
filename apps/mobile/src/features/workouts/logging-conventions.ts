import type { Exercise, WeightUnit } from "@levelup/shared";

// How to read the weight and REPS columns for an exercise. These conventions are what the
// server's XP tuning assumes (see apps/api/.../exercise-catalog.ts), so the UI must say them.
// Driven by exercise DATA (equipment, repsUnit), never by exercise names.

export type LoggingConvention = {
  repsLabel: "REPS" | "SEC";
  /** Shown under the exercise name; null when the defaults need no explaining. */
  hint: string | null;
};

export function loggingConvention(exercise: Exercise, unit: WeightUnit = "kg"): LoggingConvention {
  const repsLabel = exercise.repsUnit === "seconds" ? "SEC" : "REPS";
  const hints: string[] = [];
  if (exercise.repsUnit === "seconds") hints.push("Log seconds held");
  if (exercise.equipment === "dumbbell") hints.push(`${unit} per dumbbell`);
  if (exercise.equipment === "bodyweight") hints.push(`Added ${unit} only · 0 = bodyweight`);
  return { repsLabel, hint: hints.length > 0 ? hints.join(" · ") : null };
}
