import { liftedKg, setEffort, setXp, SET_XP, type ExerciseTuning } from "./progression.js";
import type { RepsUnit } from "./workouts.js";
import type { FlagReason, SetTag } from "./xp-codes.js";
import {
  judgeSession,
  jumpBaseline,
  jumpCappedXp,
  jumpCheckValue,
  plausibilityFlag,
  plausibilityLimits,
  type PlausibilityExercise,
} from "./xp-limits.js";

// ---------------------------------------------------------------------------
// Scoring a whole session's sets: the one pipeline the server (at Finish), the app (live
// preview) and the balancing simulation all run, so they can't drift apart. Pure.
//
// Per exercise, across the whole session (the same exercise twice, e.g. in a superset,
// is ONE exercise here), in the order the sets were completed:
//   1. Plausibility: an implausible set is flagged (0 XP, "Check this set").
//   2. Jump cap against the player's best from earlier sessions (above_history).
//   3. Effort against the higher of the 12-week best and this session's best.
//   4. Warm-ups (low effort before the exercise's heaviest set) and easy sets get a tag.
//   5. Only the first 10 non-warm-up sets of an exercise earn XP ("Beyond 10 sets").
//   6. The set's XP.
// Not here: the daily cap and the 14-day rule, which need the server's view of the day.
// ---------------------------------------------------------------------------

/** A set below this effort is tagged as a warm-up (before the heaviest set) or an easy set. */
export const LOW_EFFORT = 0.5;
/** Only this many non-warm-up sets of one exercise per session earn XP. */
export const MAX_XP_SETS_PER_EXERCISE = 10;


/** The short label shown after a set's XP in the live view and the summary. */
export function setTagText(tag: SetTag): string {
  switch (tag) {
    case "check_set":
      return "Check this set";
    case "beyond_set_limit":
      return `Beyond ${MAX_XP_SETS_PER_EXERCISE} sets`;
    case "above_history":
      return "Above your best · +25%";
    case "warm_up":
      return "Warm-up";
    case "easy_set":
      return "Easy set";
    case "timed_limit":
      return `Counted to ${SET_XP.timedMaxSec / 60}:00`;
  }
}

export type ScoringExercise = PlausibilityExercise & ExerciseTuning & { repsUnit: RepsUnit };

/** What scoring needs from the player's history with one exercise (values: estimated 1RM in lifted kg, or seconds). */
export type ExerciseXpHistory = {
  /** Best value in the last 12 weeks (SET_XP.effortWindowDays), or null. */
  recentBest: number | null;
  /** The jump-cap baseline from earlier sessions (jumpBaseline), or null the first time. */
  jumpBaseline: number | null;
};

export type SessionSet = { exerciseId: string; reps: number; weightKg: number };

export type ScoredSet = {
  xp: number;
  /** 0 to 1; always 1 for timed exercises and flagged sets. */
  effort: number;
  tag: SetTag | null;
  /** What workout_set.flag_reason stores: plausibility reasons and above_history. */
  flagReason: FlagReason | null;
  /** True only for implausible sets (workout_set.is_flagged): 0 XP, not a PR. */
  isFlagged: boolean;
};

export type SessionScore = {
  /** One per input set, in the same order. */
  sets: ScoredSet[];
  /** Per exercise, for the NEXT session: its jump baseline and this session's best value. */
  exercises: Map<string, { jumpBaselineAfter: number | null; sessionBest: number | null }>;
};

/**
 * Scores every set of a session. `sets` in the order completed; `bodyweight.xp` is the XP
 * bodyweight (xpBodyweightOnDate), `bodyweight.typed` the real one (lifted kg, as PRs use).
 */
export function scoreSessionSets(input: {
  sets: SessionSet[];
  exercises: Map<string, ScoringExercise>;
  history: Map<string, ExerciseXpHistory>;
  bodyweight: { xp: number; typed: number };
}): SessionScore {
  const scored: ScoredSet[] = input.sets.map(() => ({ xp: 0, effort: 1, tag: null, flagReason: null, isFlagged: false }));
  const summary: SessionScore["exercises"] = new Map();

  for (const [exerciseId, indexes] of groupByExercise(input.sets)) {
    const exercise = input.exercises.get(exerciseId);
    if (!exercise) throw new Error(`Exercise ${exerciseId} missing from scoring input`);
    const history = input.history.get(exerciseId) ?? { recentBest: null, jumpBaseline: null };
    const limits = plausibilityLimits(exercise);

    // 1. Plausibility.
    const valid: number[] = [];
    for (const i of indexes) {
      const reason = plausibilityFlag(input.sets[i]!, limits);
      if (reason) scored[i] = { xp: 0, effort: 1, tag: "check_set", flagReason: reason, isFlagged: true };
      else valid.push(i);
    }
    if (valid.length === 0) {
      summary.set(exerciseId, { jumpBaselineAfter: history.jumpBaseline, sessionBest: null });
      continue;
    }

    // 2. Jump cap, against earlier sessions only (the baseline is fixed for the session).
    const lifted = valid.map((i) => liftedKg(input.sets[i]!.weightKg, input.bodyweight.typed, exercise.bodyweightRatio));
    const values = valid.map((i, n) => jumpCheckValue({ reps: input.sets[i]!.reps, loadKg: lifted[n]! }, exercise.repsUnit));
    const judged = judgeSession(history.jumpBaseline, values);
    const sessionBest = Math.max(...values);
    summary.set(exerciseId, { jumpBaselineAfter: judged.baselineAfter, sessionBest });

    // 3-6. Effort, tags, the 10-set limit and the XP.
    const timed = exercise.repsUnit === "seconds";
    const reference = Math.max(sessionBest, history.recentBest ?? 0);
    const heaviest = Math.max(...valid.map((i) => input.sets[i]!.weightKg));
    const firstHeaviest = valid.find((i) => input.sets[i]!.weightKg === heaviest)!;
    let counted = 0;

    valid.forEach((i, n) => {
      const set = input.sets[i]!;
      const effort = timed ? 1 : setEffort(set.reps, lifted[n]!, reference);
      const warmUp = !timed && effort < LOW_EFFORT && i < firstHeaviest;
      const aboveHistory = judged.aboveHistory[n]!;
      const flagReason = aboveHistory ? "above_history" : null;

      if (!warmUp && ++counted > MAX_XP_SETS_PER_EXERCISE) {
        scored[i] = { xp: 0, effort, tag: "beyond_set_limit", flagReason, isFlagged: false };
        return;
      }
      const tag: SetTag | null = aboveHistory
        ? "above_history"
        : warmUp
          ? "warm_up"
          : !timed && effort < LOW_EFFORT
            ? "easy_set"
            : timed && set.reps > SET_XP.timedMaxSec
              ? "timed_limit"
              : null;
      const xp = jumpCappedXp(setXp(set, input.bodyweight.xp, exercise, effort), judged.factors[n]!);
      scored[i] = { xp, effort, tag, flagReason, isFlagged: false };
    });
  }

  return { sets: scored, exercises: summary };
}

/** Set indexes per exercise, in the order the exercise first appears. */
function groupByExercise(sets: SessionSet[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  sets.forEach((set, i) => groups.set(set.exerciseId, [...(groups.get(set.exerciseId) ?? []), i]));
  return groups;
}

/**
 * The 12-week best for effort: the best value among sessions on or after `today` minus
 * the window. `sessions`: each earlier session's best value with its date (YYYY-MM-DD or ISO).
 */
export function recentBest(sessions: { date: string; value: number }[], today: string): number | null {
  const from = Date.parse(today.slice(0, 10)) - SET_XP.effortWindowDays * 24 * 60 * 60 * 1000;
  const recent = sessions.filter((s) => Date.parse(s.date.slice(0, 10)) >= from).map((s) => s.value);
  return recent.length > 0 ? Math.max(...recent) : null;
}

/** One earlier session of an exercise: its date, the bodyweight in effect then, and its non-flagged sets as logged. */
export type PastExerciseSession = { date: string; bodyweightKg: number; sets: { reps: number; weightKg: number }[] };

/**
 * An exercise's ExerciseXpHistory before a session on `today`, rebuilt from its earlier
 * sessions (oldest first). Leave out is_flagged sets; KEEP jump-capped ones (judgeSession
 * caps them at the line itself). Gives the same values the simulation carries from one
 * session to the next with scoreSessionSets' jumpBaselineAfter and sessionBest.
 *
 * It replays the player's whole history of the exercise: fine at today's sizes (see the
 * performance test in the API); the planned next step is a stored row per player and
 * exercise, updated at Finish.
 */
export function exerciseXpHistory(
  sessions: PastExerciseSession[],
  exercise: { bodyweightRatio: number; repsUnit: RepsUnit },
  today: string,
): ExerciseXpHistory {
  const values = sessions.map((s) =>
    s.sets.map((set) => jumpCheckValue({ reps: set.reps, loadKg: liftedKg(set.weightKg, s.bodyweightKg, exercise.bodyweightRatio) }, exercise.repsUnit)),
  );
  const bests = sessions.flatMap((s, i) => (values[i]!.length > 0 ? [{ date: s.date, value: Math.max(...values[i]!) }] : []));
  return { recentBest: recentBest(bests, today), jumpBaseline: jumpBaseline(values) };
}
