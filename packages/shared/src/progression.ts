import type { Equipment, RepsUnit } from "./workouts.js";

// ---------------------------------------------------------------------------
// Progression rules: XP, estimated 1RM, personal records, rest time, coach hints.
//
// Pure functions only (same input -> same output). The SERVER runs them at Finish and
// is the only one that awards anything; the app runs the same functions to show live
// numbers during a workout. See docs/ARCHITECTURE.md, "XP & level system".
// ---------------------------------------------------------------------------

/** Used when the player has never entered a bodyweight (the app nudges them to). */
export const BODYWEIGHT_FALLBACK_KG = 75;
/** Above this many reps, an estimated 1RM is unreliable: tracked as "most reps" instead. */
export const E1RM_MAX_REPS = 12;

export type ExerciseTuning = { loadFactor: number; bodyweightRatio: number };

/**
 * The bodyweight to use for a workout on `date` (any ISO date-time; its UTC date counts):
 * the latest entry on or before that day. If every entry is later, the earliest one
 * (a better guess than a generic value); with no entries at all, the 75 kg fallback.
 */
export function bodyweightOnDate(entries: { kg: number; measuredOn: string }[], date: string): number {
  if (entries.length === 0) return BODYWEIGHT_FALLBACK_KG;
  const day = date.slice(0, 10);
  const sorted = [...entries].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  const inEffect = sorted.filter((e) => e.measuredOn <= day).at(-1);
  return (inEffect ?? sorted[0]!).kg;
}

const round = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

// --- Load and XP -------------------------------------------------------------------

/**
 * The real weight moved per rep: the logged (added) weight plus the share of your body
 * the exercise moves. A 0 kg pull-up at 80 kg bodyweight lifts 80 kg.
 */
export function liftedKg(weightKg: number, bodyweightKg: number, bodyweightRatio: number): number {
  return weightKg + bodyweightKg * bodyweightRatio;
}

/** Lifted kg scaled by the exercise's XP balancing factor (a knob, not physics). */
export function effectiveKg(weightKg: number, bodyweightKg: number, tuning: ExerciseTuning): number {
  return liftedKg(weightKg, bodyweightKg, tuning.bodyweightRatio) * tuning.loadFactor;
}

/**
 * XP for one completed set: round(reps x effective kg / 10).
 * One function on purpose: swapping the XP formula later means changing only this.
 */
export function setXp(set: { reps: number; weightKg: number }, bodyweightKg: number, tuning: ExerciseTuning): number {
  return Math.round((set.reps * effectiveKg(set.weightKg, bodyweightKg, tuning)) / 10);
}

/** Bonus for hitting the weekly target. Stub until Milestone 5. */
export function weeklyTargetXp(): number {
  return 0;
}

/** Bonus for the weekly streak. Stub until Milestone 5. */
export function streakXp(): number {
  return 0;
}

// --- Estimated 1RM and records ---------------------------------------------------

/**
 * Epley: load x (1 + reps / 30), rounded to 0.1 kg.
 * - 1 rep: the weight lifted (Epley would add 3%, which no one actually lifted).
 * - More than 12 reps: null. The estimate is unreliable there; such sets count as
 *   "most reps at a weight" instead.
 */
export function estimatedOneRepMax(loadKg: number, reps: number): number | null {
  if (!Number.isFinite(loadKg) || reps < 1 || loadKg <= 0) return null;
  if (reps === 1) return round(loadKg, 1);
  if (reps > E1RM_MAX_REPS) return null;
  return round(loadKg * (1 + reps / 30), 1);
}

/** A completed set reduced to what records need: reps (or seconds) and lifted kg. */
export type RecordSet = { reps: number; loadKg: number };

/** Everything needed to judge whether a new set beats the past. */
export type RecordBook = {
  bestE1rm: number | null;
  longestHold: number | null; // timed exercises, in seconds
  sets: RecordSet[]; // every previous set, for "most reps at this weight or heavier"
};

export const emptyRecordBook = (): RecordBook => ({ bestE1rm: null, longestHold: null, sets: [] });

export type RecordKind = "e1rm" | "reps_at_weight" | "longest_hold";

export type NewRecord = {
  /** Index of the set within the list passed in. */
  index: number;
  kind: RecordKind;
  value: number; // kg for e1rm, reps for reps_at_weight, seconds for longest_hold
  previousValue: number;
};

/** Adds sets to a record book (used for history; no PRs are judged). */
export function addToRecordBook(book: RecordBook, sets: RecordSet[], repsUnit: RepsUnit): RecordBook {
  return judgeSets(book, sets, repsUnit).book;
}

/**
 * Which of these sets (in the order completed) are personal records.
 * A set must beat the best so far: previous sessions AND earlier sets of this session,
 * so set 3 can be a PR after set 2 already was. With no history at all there is nothing
 * to beat: the first session sets the baseline instead of being all PRs.
 */
export function findNewRecords(previous: RecordBook, sets: RecordSet[], repsUnit: RepsUnit): NewRecord[] {
  return judgeSets(previous, sets, repsUnit).records;
}

function judgeSets(start: RecordBook, sets: RecordSet[], repsUnit: RepsUnit) {
  const book: RecordBook = { bestE1rm: start.bestE1rm, longestHold: start.longestHold, sets: [...start.sets] };
  const hadHistory = start.sets.length > 0;
  const records: NewRecord[] = [];

  sets.forEach((set, index) => {
    if (repsUnit === "seconds") {
      if (hadHistory && book.longestHold !== null && set.reps > book.longestHold) {
        records.push({ index, kind: "longest_hold", value: set.reps, previousValue: book.longestHold });
      }
      book.longestHold = Math.max(book.longestHold ?? 0, set.reps);
    } else {
      const e1rm = estimatedOneRepMax(set.loadKg, set.reps);
      if (e1rm !== null) {
        if (hadHistory && book.bestE1rm !== null && e1rm > book.bestE1rm) {
          records.push({ index, kind: "e1rm", value: e1rm, previousValue: book.bestE1rm });
        }
        book.bestE1rm = Math.max(book.bestE1rm ?? 0, e1rm);
      } else if (set.reps > E1RM_MAX_REPS) {
        // Most reps at this weight or heavier, from any earlier set.
        const atLeastAsHeavy = book.sets.filter((s) => s.loadKg >= set.loadKg).map((s) => s.reps);
        const best = atLeastAsHeavy.length > 0 ? Math.max(...atLeastAsHeavy) : null;
        if (best !== null && set.reps > best) {
          records.push({ index, kind: "reps_at_weight", value: set.reps, previousValue: best });
        }
      }
    }
    book.sets.push(set);
  });

  return { book, records };
}

/** Total weight moved: reps x lifted kg. Not meaningful for timed exercises. */
export function volumeKg(sets: RecordSet[]): number {
  return round(sets.reduce((sum, s) => sum + s.reps * s.loadKg, 0), 1);
}

export type StatSet = RecordSet & { weightKg: number; date: string };

export type ExerciseStats = {
  bestE1rm: (StatSet & { e1rm: number }) | null;
  heaviestSet: StatSet | null;
  bestSessionVolume: { volumeKg: number; date: string } | null;
  /** Most reps in a set (most seconds for timed exercises); ties go to the heavier set. */
  mostReps: StatSet | null;
};

/** The history screen's record tiles, from every past session of one exercise. */
export function exerciseStats(sessions: { date: string; sets: (RecordSet & { weightKg: number })[] }[]): ExerciseStats {
  const stats: ExerciseStats = { bestE1rm: null, heaviestSet: null, bestSessionVolume: null, mostReps: null };
  for (const session of sessions) {
    const volume = volumeKg(session.sets);
    if (volume > 0 && (!stats.bestSessionVolume || volume > stats.bestSessionVolume.volumeKg)) {
      stats.bestSessionVolume = { volumeKg: volume, date: session.date };
    }
    for (const set of session.sets) {
      const s: StatSet = { ...set, date: session.date };
      const e1rm = estimatedOneRepMax(set.loadKg, set.reps);
      if (e1rm !== null && (!stats.bestE1rm || e1rm > stats.bestE1rm.e1rm)) stats.bestE1rm = { ...s, e1rm };
      if (!stats.heaviestSet || set.loadKg > stats.heaviestSet.loadKg || (set.loadKg === stats.heaviestSet.loadKg && set.reps > stats.heaviestSet.reps)) {
        stats.heaviestSet = s;
      }
      if (!stats.mostReps || set.reps > stats.mostReps.reps || (set.reps === stats.mostReps.reps && set.loadKg > stats.mostReps.loadKg)) {
        stats.mostReps = s;
      }
    }
  }
  return stats;
}

// --- Rest time --------------------------------------------------------------------

export const REST_MIN_SEC = 15;
export const REST_MAX_SEC = 600;
export const REST_STEP_SEC = 15;
export const REST_DEFAULT_SEC = 120;

/** Snaps to 15 s steps and keeps it within 15 s - 10 min. */
export function clampRestSec(seconds: number): number {
  const stepped = Math.round(seconds / REST_STEP_SEC) * REST_STEP_SEC;
  return Math.min(REST_MAX_SEC, Math.max(REST_MIN_SEC, stepped));
}

/** Priority: the player's own choice > the routine's > the exercise's suggestion > 2:00. */
export function resolveRestSec(options: {
  preferenceSec?: number | null;
  routineSec?: number | null;
  suggestedSec?: number | null;
}): number {
  const chosen = options.preferenceSec ?? options.routineSec ?? options.suggestedSec ?? REST_DEFAULT_SEC;
  return clampRestSec(chosen);
}

// --- Coach hint (double progression, fixed rules, no AI) ----------------------------

/**
 * How much to add when every set hit its target, per equipment type. Passed in (not
 * hard-coded) so it can be tuned, or loaded from the database later. null = there's no
 * sensible weight step, so progress by adding reps instead.
 */
export type ProgressionIncrements = Record<Equipment, number | null>;

export const DEFAULT_INCREMENTS: ProgressionIncrements = {
  barbell: 2.5,
  machine: 2.5,
  cable: 2.5,
  dumbbell: 1, // per dumbbell
  kettlebell: 4, // kettlebells come in 4 kg steps
  bodyweight: null,
};

/** Seconds added for a timed exercise once every hold reached the target. */
export const HOLD_INCREMENT_SEC = 5;

export type CoachAdvice =
  | { kind: "first_time"; targetReps: number | null }
  | { kind: "increase_weight"; lastWeightKg: number; lastReps: number[]; weightKg: number; reps: number }
  | { kind: "repeat"; lastWeightKg: number; lastReps: number[]; weightKg: number; reps: number }
  | { kind: "add_reps"; lastWeightKg: number; lastReps: number[]; weightKg: number; reps: number };

/**
 * Double progression: raise the weight only when EVERY working set last time reached
 * the target reps; otherwise keep the weight and aim to hit the target on every set.
 * Working sets = last time's sets at its heaviest weight. Target = the routine's target,
 * or last time's best rep count when there is no routine.
 */
export function coachAdvice(input: {
  lastSets: { reps: number; weightKg: number }[];
  targetReps?: number | null;
  equipment: Equipment;
  repsUnit: RepsUnit;
  increments?: ProgressionIncrements;
}): CoachAdvice {
  const increments = input.increments ?? DEFAULT_INCREMENTS;
  if (input.lastSets.length === 0) return { kind: "first_time", targetReps: input.targetReps ?? null };

  const lastWeightKg = Math.max(...input.lastSets.map((s) => s.weightKg));
  const lastReps = input.lastSets.filter((s) => s.weightKg === lastWeightKg).map((s) => s.reps);
  const target = input.targetReps ?? Math.max(...lastReps);
  const allHit = lastReps.every((reps) => reps >= target);
  const step = increments[input.equipment];

  if (!allHit) return { kind: "repeat", lastWeightKg, lastReps, weightKg: lastWeightKg, reps: target };
  if (input.repsUnit === "seconds") {
    return { kind: "add_reps", lastWeightKg, lastReps, weightKg: lastWeightKg, reps: target + HOLD_INCREMENT_SEC };
  }
  if (step === null) return { kind: "add_reps", lastWeightKg, lastReps, weightKg: lastWeightKg, reps: target + 1 };
  return { kind: "increase_weight", lastWeightKg, lastReps, weightKg: round(lastWeightKg + step, 2), reps: target };
}

const kg = (value: number) => `${round(value, 2)} kg`;

/** The one-line hint under the exercise name. Sentence case, no AI. */
export function coachHintText(advice: CoachAdvice, repsUnit: RepsUnit): string {
  const unit = repsUnit === "seconds" ? "s" : "";
  const list = (reps: number[]) => reps.map((r) => `${r}${unit}`).join(", ");
  switch (advice.kind) {
    case "first_time":
      return repsUnit === "seconds"
        ? "First time: hold for as long as you can with good form."
        : `First time: pick a weight you can lift for ${advice.targetReps ?? 8} good reps.`;
    case "increase_weight":
      return `You hit ${list(advice.lastReps)} at ${kg(advice.lastWeightKg)} last time, so today's target is ${kg(advice.weightKg)}.`;
    case "repeat": {
      const goal = advice.lastReps.map(() => `${advice.reps}${unit}`).join(", ");
      const at = advice.lastWeightKg > 0 ? ` at ${kg(advice.lastWeightKg)}` : "";
      return `You hit ${list(advice.lastReps)}${at} last time. Stay there and aim for ${goal}.`;
    }
    case "add_reps":
      return repsUnit === "seconds"
        ? `You held ${list(advice.lastReps)} last time. Aim for ${advice.reps}s today.`
        : `You hit ${list(advice.lastReps)} last time. Aim for ${advice.reps} reps today.`;
  }
}
