import { REPS_MAX, routineInputSchema, TARGET_SETS_MAX, type RoutineInput } from "@levelup/shared";
import type { ActiveWorkout, DraftExercise, PlannedExercise, Result } from "./active-workout";

// Finish's two questions, as plain functions:
// - "Update {routine} with these changes?" when a workout from a routine differs from it
//   (exercises or sets added or removed, or a new order), and
// - "Save as routine?" for an empty workout.
// Both turn the workout into a routine with routineFromWorkout.

type Paired = { draft: DraftExercise; planned: PlannedExercise | undefined };

/**
 * Pairs each exercise with its place in the plan: the 2nd bench press in the workout with
 * the 2nd bench press in the plan, so an exercise done twice still lines up.
 */
function pairWithPlan(workout: ActiveWorkout, plan: PlannedExercise[]): Paired[] {
  const seen = new Map<string, number>();
  return workout.exercises.map((draft) => {
    const n = seen.get(draft.exercise.id) ?? 0;
    seen.set(draft.exercise.id, n + 1);
    return { draft, planned: plan.filter((p) => p.exerciseId === draft.exercise.id)[n] };
  });
}

/** What's different from the routine, in words; empty when unchanged (or no routine). */
export function routineChanges(workout: ActiveWorkout, exerciseNames: Map<string, string>): string[] {
  const plan = workout.plan;
  if (!workout.routineId || !plan) return [];
  const paired = pairWithPlan(workout, plan);
  const changes: string[] = [];
  const name = (id: string) => exerciseNames.get(id) ?? "An exercise";

  for (const { draft } of paired.filter((p) => !p.planned)) changes.push(`Added ${draft.exercise.name}`);

  const usedCounts = new Map<string, number>();
  for (const p of paired) if (p.planned) usedCounts.set(p.planned.exerciseId, (usedCounts.get(p.planned.exerciseId) ?? 0) + 1);
  const leftover = new Map(usedCounts);
  for (const planned of plan) {
    const left = leftover.get(planned.exerciseId) ?? 0;
    if (left > 0) leftover.set(planned.exerciseId, left - 1);
    else changes.push(`Removed ${name(planned.exerciseId)}`);
  }

  for (const { draft, planned } of paired) {
    if (planned && draft.sets.length !== planned.targetSets) {
      changes.push(`${draft.exercise.name}: ${draft.sets.length} ${draft.sets.length === 1 ? "set" : "sets"} (was ${planned.targetSets})`);
    }
  }

  // Same exercises, different order.
  const kept = paired.filter((p) => p.planned).map((p) => p.planned!);
  if (changes.length === 0 && kept.some((planned, i) => planned !== plan[i])) changes.push("New exercise order");
  return changes;
}

/**
 * The routine this workout describes: its exercises in order, each with as many sets as
 * were done here. Targets and rest come from the plan where the exercise was planned;
 * otherwise reps come from the sets themselves and rest is left to the player's usual.
 */
export function routineFromWorkout(workout: ActiveWorkout, name: string): Result<RoutineInput> {
  const paired = pairWithPlan(workout, workout.plan ?? []);
  const parsed = routineInputSchema.safeParse({
    name,
    exercises: paired
      .filter(({ draft }) => draft.sets.length > 0)
      .map(({ draft, planned }) => ({
        exerciseId: draft.exercise.id,
        targetSets: Math.min(TARGET_SETS_MAX, draft.sets.length),
        targetReps: planned?.targetReps ?? draft.targetReps ?? repsFromSets(draft),
        restSec: planned?.restSec ?? null,
      })),
  });
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: parsed.error.issues[0]?.message ?? "Check the routine." };
}

/** The most reps typed in any set (what the player aimed for), else a sensible default. */
function repsFromSets(draft: DraftExercise): number {
  const typed = draft.sets.map((s) => Number(s.reps)).filter((r) => Number.isInteger(r) && r >= 1);
  const fallback = draft.exercise.repsUnit === "seconds" ? 30 : 8;
  return Math.min(REPS_MAX, typed.length ? Math.max(...typed) : fallback);
}
