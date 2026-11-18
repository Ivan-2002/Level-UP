import { z } from "zod";
import { coachIncrementsKg, formatWeight, STORED_KG_DECIMALS, type WeightUnit } from "./units.js";
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
 * The REAL value the player typed: for PRs, volume and display. XP uses xpBodyweightOnDate.
 */
export function bodyweightOnDate(entries: { kg: number; measuredOn: string }[], date: string): number {
  return entries.length === 0 ? BODYWEIGHT_FALLBACK_KG : entryInEffect(entries, date).kg;
}

function entryInEffect<E extends { measuredOn: string }>(entries: E[], date: string): E {
  const day = date.slice(0, 10);
  const sorted = [...entries].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  return sorted.findLast((e) => e.measuredOn <= day) ?? sorted[0]!;
}

// --- XP bodyweight ------------------------------------------------------------------
// Set XP is relative to bodyweight (x sqrt(75 / bodyweight)), so XP rewards effort, not absolute
// strength. That makes a LOW bodyweight worth XP, so XP doesn't trust the typed value
// blindly. See docs/ARCHITECTURE.md, "XP per completed set".

export const BODYWEIGHT_XP = {
  /** Set XP is scaled by sqrt(referenceKg / bodyweight), so a 75 kg player's load is unchanged. */
  referenceKg: 75,
  /** The XP bodyweight is clamped to this range, whatever was typed. */
  minKg: 40,
  maxKg: 200,
  /** An entry can move the XP bodyweight (either way) by at most this share of it per week since the previous entry. */
  maxChangePerWeek: 0.02,
} as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const clampXpBodyweight = (kg: number) => Math.min(BODYWEIGHT_XP.maxKg, Math.max(BODYWEIGHT_XP.minKg, kg));

/**
 * One bodyweight write the server received (bodyweight_receipt): append-only, so
 * re-entering a date adds a receipt instead of replacing one. `receivedAt` is when.
 */
export type BodyweightReceipt = { kg: number; measuredOn: string; receivedAt: string };

/**
 * The bodyweight set XP uses for a workout on `date`: the entry in effect that day (as
 * bodyweightOnDate picks it, by measuredOn, from each date's LATEST receipt), but its value
 * limited at the moment the server received it.
 *
 * Walking EVERY receipt in the order the server received them, each one moves the value
 * towards what was typed by at most 2% of the value per week since the previous receipt,
 * in EITHER direction. The allowance builds up with time, not per entry: 5 kg lost over
 * two months and entered once passes in full; 80 -> 40 kg overnight moves about 0.2 kg.
 * Increases are limited too because, with the square-root scaling, a higher bodyweight
 * earns more on pure bodyweight exercises (a 75 kg player typing 200 kg would get x 1.63
 * on pull-ups). Honest bulking (0.25-0.5% a week) is far inside the limit; a typo
 * corrected later lags like any other change, which costs that player a little XP for
 * a week or so rather than giving any.
 *
 * Why receive time, not measuredOn: the player chooses measuredOn, so a backdated entry
 * could otherwise claim months of allowance. Why receipts, not entries: re-entering a
 * date replaces its entry, so with entries alone, re-entering EVERY date erased the
 * history and made the first edit an unchecked first entry. Receipts are never replaced,
 * so only the very first receipt is taken as typed: there's nothing to check it against.
 */
export function xpBodyweightOnDate(receipts: BodyweightReceipt[], date: string): number {
  if (receipts.length === 0) return BODYWEIGHT_FALLBACK_KG;
  const limited = limitedOnReceipt(receipts);
  // Each date's latest receipt is that date's entry (Map keys keep the walk's order).
  const latestPerDate = new Map<string, BodyweightReceipt>();
  for (const receipt of limited.keys()) latestPerDate.set(receipt.measuredOn, receipt);
  return limited.get(entryInEffect([...latestPerDate.values()], date))!;
}

/** Every receipt's XP value at the moment it was received, in the order received. */
function limitedOnReceipt(receipts: BodyweightReceipt[]): Map<BodyweightReceipt, number> {
  const byReceipt = [...receipts].sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
  const limited = new Map<BodyweightReceipt, number>();
  let value: number | null = null;
  let previousAt = 0;
  for (const receipt of byReceipt) {
    const typed = clampXpBodyweight(receipt.kg);
    const at = Date.parse(receipt.receivedAt);
    if (value === null) {
      value = typed;
    } else {
      const allowance: number = value * BODYWEIGHT_XP.maxChangePerWeek * (Math.max(0, at - previousAt) / WEEK_MS);
      value = typed >= value ? Math.min(typed, value + allowance) : Math.max(typed, value - allowance);
    }
    previousAt = at;
    limited.set(receipt, value);
  }
  return limited;
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

// Set XP (Milestone 5, "formula C"; docs/ARCHITECTURE.md, "XP per completed set").
//
// A set earns XP for how STRONG an effort it was, not for how much it moved:
//   reps exercises: round(K x estimated 1RM of the XP load x effort)
//   timed exercises: round(seconds held, at most 120, x XP load / 10)
// where XP load = effective kg x sqrt(75 / bodyweight) and effort is 0 to 1 (setEffort).
//
// Why estimated 1RM: the old reps x load paid a 30-rep set at 50% three times as much as a
// heavy set of 5 at 87%, for the same hard effort. Epley rates both as about the lifter's
// 1RM, so every hard set is worth about the same, whatever the rep range. On its own it
// would also pay a single at half your max half a hard set (warm-ups, farming), so it is
// multiplied by effort: how close the set was to failure.

export const SET_XP = {
  /** Scales estimated 1RM to XP: an intermediate's normal session earns what it did under reps x load. */
  scale: 0.73,
  /** A set within this many reps of failure counts as full effort (the usual "hard set"). */
  repsInReserveAllowance: 3,
  /** Effort is measured against the best estimated 1RM from this many days back (and today). */
  effortWindowDays: 84,
  /** Timed exercises count at most this many seconds per set. */
  timedMaxSec: 120,
} as const;

/**
 * The load XP counts: effective kg x sqrt(75 / bodyweight), bodyweight clamped to 40-200 kg.
 * The square root softens the bodyweight factor: a 110 kg beginner isn't hit twice (weak AND
 * heavy), a 60 kg lifter still gains, and typing a fake low bodyweight pays half as much.
 */
export function xpLoadKg(weightKg: number, xpBodyweightKg: number, tuning: ExerciseTuning): number {
  const bodyweightKg = clampXpBodyweight(xpBodyweightKg);
  return effectiveKg(weightKg, bodyweightKg, tuning) * Math.sqrt(BODYWEIGHT_XP.referenceKg / bodyweightKg);
}

/** Epley for any number of reps; a single rep is the weight lifted. Not rounded. */
export function epleyOneRepMax(loadKg: number, reps: number): number {
  return reps <= 1 ? loadKg : loadKg * (1 + reps / 30);
}

/**
 * How hard a set was, 0 to 1: reps done / reps the player could have done at that weight,
 * where "could have" comes from `referenceKg` (their best estimated 1RM, lifted kg) and a
 * set within 3 reps of failure counts as 1. At or above the reference: 1.
 * A warm-up single at half your max is about 0.03; a working set 2 reps short of failure, 1.
 */
export function setEffort(reps: number, liftedLoadKg: number, referenceKg: number | null): number {
  if (referenceKg === null || liftedLoadKg <= 0 || liftedLoadKg >= referenceKg) return 1;
  const possibleReps = 30 * (referenceKg / liftedLoadKg - 1); // Epley, solved for reps
  return Math.min(1, reps / Math.max(1, possibleReps - SET_XP.repsInReserveAllowance));
}

/**
 * XP for one completed set (before the jump cap, the 10-set limit and the daily cap, which
 * scoreSessionSets and the server apply). `xpBodyweightKg`: xpBodyweightOnDate on the server.
 * One function on purpose: swapping the XP formula later means changing only this.
 */
export function setXp(
  set: { reps: number; weightKg: number },
  xpBodyweightKg: number,
  exercise: ExerciseTuning & { repsUnit: RepsUnit },
  effort = 1,
): number {
  const load = xpLoadKg(set.weightKg, xpBodyweightKg, exercise);
  if (exercise.repsUnit === "seconds") return Math.round((Math.min(set.reps, SET_XP.timedMaxSec) * load) / 10);
  return Math.round(SET_XP.scale * epleyOneRepMax(load, set.reps) * effort);
}

// Weekly goal and streak bonuses: see weekly-goal.ts.

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

/** A rest time as the API accepts it: 15 s - 10 min, in 15 s steps. */
export const restSecSchema = z
  .number({ error: "Rest must be a number of seconds." })
  .int()
  .min(REST_MIN_SEC, `Rest must be at least ${REST_MIN_SEC} seconds.`)
  .max(REST_MAX_SEC, `Rest must be at most ${REST_MAX_SEC / 60} minutes.`)
  .multipleOf(REST_STEP_SEC, `Rest goes up in steps of ${REST_STEP_SEC} seconds.`);

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
 * How much to add (IN KG) when every set hit its target, per equipment type. Passed in
 * (not hard-coded) so it can be tuned, or loaded from the database later. null = there's
 * no sensible weight step, so progress by adding reps instead.
 * The defaults depend on the player's unit (units.ts): +2.5 kg barbell / +1 kg dumbbell
 * for kg players, +5 lb for lb players, converted to kg here.
 */
export type ProgressionIncrements = Record<Equipment, number | null>;

/** The kg player's defaults: barbell/machine/cable +2.5, dumbbell +1 (each), kettlebell +4. */
export const DEFAULT_INCREMENTS: ProgressionIncrements = coachIncrementsKg("kg");

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
  /** Default: the player's unit's defaults (5 lb steps for lb players). */
  increments?: ProgressionIncrements;
  weightUnit?: WeightUnit;
}): CoachAdvice {
  const increments = input.increments ?? coachIncrementsKg(input.weightUnit ?? "kg");
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
  // Same precision as storage, so 135 lb + 5 lb shows as exactly 140 lb.
  return { kind: "increase_weight", lastWeightKg, lastReps, weightKg: round(lastWeightKg + step, STORED_KG_DECIMALS), reps: target };
}

/** The one-line hint under the exercise name, in the player's unit. Sentence case, no AI. */
export function coachHintText(advice: CoachAdvice, repsUnit: RepsUnit, weightUnit: WeightUnit = "kg"): string {
  const kg = (value: number) => formatWeight(value, weightUnit);
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
