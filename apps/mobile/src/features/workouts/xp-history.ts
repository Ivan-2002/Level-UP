import {
  applyDailyCap,
  localDate,
  scoreSessionSets,
  type DailyCapConfig,
  type DayXp,
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
// - only the signed-in player's outbox items are replayed;
// - an item the server's copy already counts (its clientId is in `today.clientIds`: it
//   arrived but the response was lost) is skipped, so it isn't counted twice.
// Once a workout reaches the server it leaves the outbox and the copy is refetched.
//
// The same replay gives each queued workout's set XP, for the live daily cap: XP already
// awarded on the workout's day = the server's count plus the queued workouts of that day.

export type XpHistory = Map<string, ExerciseXpHistory>;

/** Where the server's copy is saved on the phone: per player, so another account never reads it. */
export const xpHistoryCacheKey = (userId: string) => `levelup.xp-history.${userId}`;

export type ReplayContext = {
  /** The exercise library (tuning, plausibility limits), by id. */
  exercises: Map<string, Exercise>;
  /** Today's bodyweights: `xp` (profile.xpBodyweightKg) and `typed` (profile.bodyweightKg). */
  bodyweight: { xp: number; typed: number };
};

export function historyFromList(list: Pick<ExerciseXpHistoryList, "items">): XpHistory {
  return new Map(list.items.map((i) => [i.exerciseId, { recentBest: i.recentBest, jumpBaseline: i.jumpBaseline }]));
}

/**
 * The history after one more workout: each exercise's jump baseline moves as the server's
 * replay would move it (scoreSessionSets' jumpBaselineAfter), and its session best joins
 * the 12-week best. Exercises missing from the library are skipped.
 */
export function historyAfterWorkout(
  history: XpHistory,
  payload: FinishWorkoutInput,
  context: ReplayContext,
): XpHistory {
  return replayWorkout(history, payload, context).history;
}

/** One queued workout through the shared scoring: the history after it, and its set XP (before the daily cap). */
function replayWorkout(
  history: XpHistory,
  payload: FinishWorkoutInput,
  context: ReplayContext,
): { history: XpHistory; setXp: number[] } {
  const known = payload.exercises.filter((e) => context.exercises.has(e.exerciseId));
  const sets = known.flatMap((e) =>
    e.sets.map((s) => ({ exerciseId: e.exerciseId, reps: s.reps, weightKg: s.weightKg, completedAt: s.completedAt })),
  );
  if (sets.length === 0) return { history, setXp: [] };

  const score = scoreSessionSets({ sets, exercises: context.exercises, history, bodyweight: context.bodyweight });
  const next = new Map(history);
  for (const [exerciseId, after] of score.exercises) {
    const before = history.get(exerciseId)?.recentBest ?? null;
    next.set(exerciseId, { jumpBaseline: after.jumpBaselineAfter, recentBest: higher(before, after.sessionBest) });
  }
  return { history: next, setXp: score.sets.map((s) => s.xp) };
}

/** A queued workout as replayed: when it started and its set XP before the daily cap. */
export type ReplayedWorkout = { clientId: string; startedAt: string; setXp: number[] };

/**
 * The server's copy plus `userId`'s pending outbox workouts, each building on the one
 * before, in outbox order (the order they're sent). Skips `counted`: workouts the server's
 * copy already includes (DayXp.clientIds: it got them, but the response was lost).
 *
 * One known approximation remains: a lost-response workout that started on an EARLIER
 * day isn't in `counted`, so it's replayed on top of a copy that may already include it.
 * That can only make the baseline a little higher until the copy is refetched.
 */
export function replayOutbox(
  server: XpHistory,
  outbox: OutboxItem[],
  userId: string,
  context: ReplayContext,
  counted: ReadonlySet<string> = new Set(),
): { history: XpHistory; workouts: ReplayedWorkout[] } {
  let history = server;
  const workouts: ReplayedWorkout[] = [];
  for (const item of outbox) {
    if (item.userId !== userId || item.status !== "pending" || counted.has(item.clientId)) continue;
    const replayed = replayWorkout(history, item.payload, context);
    history = replayed.history;
    workouts.push({ clientId: item.clientId, startedAt: item.payload.startedAt, setXp: replayed.setXp });
  }
  return { history, workouts };
}

/** The history the live preview uses (see replayOutbox). */
export function effectiveXpHistory(
  server: XpHistory,
  outbox: OutboxItem[],
  userId: string,
  context: ReplayContext,
  counted?: ReadonlySet<string>,
): XpHistory {
  return replayOutbox(server, outbox, userId, context, counted).history;
}

/**
 * Set XP already awarded (or about to be) on `day` before the workout in progress: the
 * daily cap's starting point. `day` is the local day the workout STARTED in the profile's
 * time zone, the rule the server dates XP by (xp_event.earned_on).
 * - The server's count, if its copy is for that day (else 0: a copy from yesterday says
 *   nothing about today).
 * - Plus each queued workout that started that day (same rule, same zone), capped in
 *   outbox order, as the server will award them when they're sent.
 */
export function dayXpBefore(input: {
  day: string;
  timeZone: string;
  today: DayXp | null;
  cap: DailyCapConfig;
  queued: ReplayedWorkout[];
}): number {
  let xp = input.today?.date === input.day ? input.today.setXp : 0;
  for (const workout of input.queued) {
    if (localDate(workout.startedAt, input.timeZone) !== input.day) continue;
    xp += applyDailyCap(xp, workout.setXp, input.cap).awarded.reduce((a, b) => a + b, 0);
  }
  return xp;
}

function higher(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}
