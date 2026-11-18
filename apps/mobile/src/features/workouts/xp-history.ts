import {
  scoreSessionSets,
  type Exercise,
  type ExerciseXpHistory,
  type ExerciseXpHistoryList,
  type FinishWorkoutInput,
} from "@levelup/shared";
import type { OutboxItem } from "./outbox";

// The player's XP history (each exercise's 12-week best and jump baseline) that the live
// preview scores against. Plain functions, unit-tested.
//
// The server's copy (GET /v1/exercises/xp-history, saved on the phone) is never edited.
// Instead, the history the preview uses is WORKED OUT: the server's copy plus this
// player's workouts still waiting in the outbox, replayed in outbox order through the
// same shared scoring Finish uses. So:
// - a second workout logged offline previews against the first one's bests;
// - a workout the server rejects ("needs attention") drops out at once, so the preview
//   never keeps bests that were never saved;
// - only the signed-in player's outbox items are replayed.
// Once a workout reaches the server it leaves the outbox and the copy is refetched.

export type XpHistory = Map<string, ExerciseXpHistory>;

export type ReplayContext = {
  /** The exercise library (tuning, plausibility limits), by id. */
  exercises: Map<string, Exercise>;
  /** Today's bodyweights: `xp` (profile.xpBodyweightKg) and `typed` (profile.bodyweightKg). */
  bodyweight: { xp: number; typed: number };
};

export function historyFromList(list: ExerciseXpHistoryList): XpHistory {
  return new Map(list.items.map((i) => [i.exerciseId, { recentBest: i.recentBest, jumpBaseline: i.jumpBaseline }]));
}

/**
 * The history after one more workout: each exercise's jump baseline moves as the server's
 * replay would move it (scoreSessionSets' jumpBaselineAfter), and its session best joins
 * the 12-week best. Exercises missing from the library are skipped.
 */
export function historyAfterWorkout(history: XpHistory, payload: FinishWorkoutInput, context: ReplayContext): XpHistory {
  const known = payload.exercises.filter((e) => context.exercises.has(e.exerciseId));
  const sets = known.flatMap((e) => e.sets.map((s) => ({ exerciseId: e.exerciseId, reps: s.reps, weightKg: s.weightKg })));
  if (sets.length === 0) return history;

  const score = scoreSessionSets({ sets, exercises: context.exercises, history, bodyweight: context.bodyweight });
  const next = new Map(history);
  for (const [exerciseId, after] of score.exercises) {
    const before = history.get(exerciseId)?.recentBest ?? null;
    next.set(exerciseId, { jumpBaseline: after.jumpBaselineAfter, recentBest: higher(before, after.sessionBest) });
  }
  return next;
}

/**
 * The history the live preview uses: the server's copy plus `userId`'s pending outbox
 * workouts, each building on the one before, in outbox order (the order they're sent).
 *
 * One known approximation: a workout whose response was lost (it IS on the server, but
 * still pending here) is replayed on top of a copy that may already include it. That
 * can only make the preview's baseline a little higher until the copy is refetched.
 */
export function effectiveXpHistory(server: XpHistory, outbox: OutboxItem[], userId: string, context: ReplayContext): XpHistory {
  return outbox
    .filter((item) => item.userId === userId && item.status === "pending")
    .reduce((history, item) => historyAfterWorkout(history, item.payload, context), server);
}

function higher(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}
