import { epleyOneRepMax } from "./progression.js";
import { formatWeight, type WeightUnit } from "./units.js";
import { HOLD_MAX_SEC, type Equipment, type Mechanic, type RepsUnit } from "./workouts.js";
import type { FlagReason } from "./xp-codes.js";

// ---------------------------------------------------------------------------
// Limits against fake or inflated workouts (docs/ARCHITECTURE.md, "Limits against fake
// or inflated workouts"). Pure rules; the server applies them at Finish and is the only
// one that awards anything. The app runs the same rules to preview XP honestly.
//
// In the order Finish applies them: plausibility limits, the jump cap against the
// player's own history, then (once the set XP is known) the 14-day rule and the daily cap.
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

//
// - weight_above_range, reps_above_range: implausible (plausibilityFlag). The set is
//   is_flagged: 0 XP, not a PR.
// - above_history: far above the player's own best (the jump cap below). NOT is_flagged:
//   the set still earns XP, capped at the 25% line, and isn't a PR.
// The codes themselves (FLAG_REASONS) live in xp-codes.ts.
export type PlausibilityFlagReason = Exclude<FlagReason, "above_history">;

/**
 * Whether a stored set can count as a personal record: not implausible (is_flagged) and
 * not jump-capped (above_history). Jump-capped sets stay in history for the jump baseline.
 */
export function canBeRecord(set: { isFlagged?: boolean; flagReason: string | null }): boolean {
  return !set.isFlagged && set.flagReason !== "above_history";
}

/**
 * Why this set is implausible, or null if it isn't. A set over both limits reports the
 * weight (one reason per set; the weight is the likelier typo).
 */
export function plausibilityFlag(
  set: { reps: number; weightKg: number },
  limits: PlausibilityLimits,
): PlausibilityFlagReason | null {
  if (set.weightKg > limits.maxWeightKg) return "weight_above_range";
  if (set.reps > limits.maxReps) return "reps_above_range";
  return null;
}

/** The sentence the summary shows for a flagged set, e.g. "320 kg is above the 300 kg limit for this exercise." */
export function flagReasonText(
  reason: PlausibilityFlagReason,
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

// --- Jump cap: against the player's own history -----------------------------------------
//
// A set far above the player's own best for that exercise is either a big honest day or
// a fake one. It earns XP as if it were exactly at the line (best + 25%), is marked
// above_history (not is_flagged), and isn't a PR. The baseline then moves only up to the
// line, so a lifter who really got stronger catches up within a few sessions, while a
// fake jump gains at most 25% per session.
//
// What's compared:
// - Reps exercises: estimated 1RM by Epley, load x (1 + reps / 30), at EVERY rep count.
//   (Single-set volume was considered and rejected: it punishes an honest switch of rep
//   range. A best of 100 kg x 5 has volume 500 and an e1RM of ~117 kg; 60 kg x 20 has
//   volume 1,200 but an e1RM of only 100 kg, so it is no jump at all.) The rule that sets
//   above 12 reps don't count applies to PR DISPLAY only.
// - Timed exercises: seconds held, against the longest hold.
//
// The load is LIFTED kilograms (logged weight plus the bodyweight share), real kilograms,
// as for PRs. Sets that plausibilityFlag flagged are left out of both sides.

export const JUMP_CAP = {
  /** A set more than this share above the player's best is capped at the line. */
  maxJump: 0.25,
} as const;

/** What the jump cap compares for one set: estimated 1RM (kg), or seconds for a timed exercise. */
export function jumpCheckValue(set: { reps: number; loadKg: number }, repsUnit: RepsUnit): number {
  return repsUnit === "seconds" ? set.reps : epleyOneRepMax(set.loadKg, set.reps);
}

export type JumpJudgement = {
  /** Per set: 1 = full XP; below 1 = its XP is scaled to the line (line / the set's value). */
  factors: number[];
  /** Per set: true if it was above the line (flag_reason above_history, not a PR). */
  aboveHistory: boolean[];
  /** The best to compare the NEXT session with. */
  baselineAfter: number | null;
};

/**
 * Judges one session's sets of an exercise against the best from EARLIER sessions.
 * The baseline is fixed for the whole session: if it moved after every set, five sets
 * could each be +25% (3x in one session). No baseline (first session, or nothing above
 * 0 yet) = nothing to compare with: only the absolute limits apply.
 */
export function judgeSession(baseline: number | null, values: number[]): JumpJudgement {
  const sessionBest = values.length > 0 ? Math.max(...values) : null;
  if (baseline === null || baseline <= 0) {
    return {
      factors: values.map(() => 1),
      aboveHistory: values.map(() => false),
      baselineAfter: sessionBest ?? baseline,
    };
  }
  const line = baseline * (1 + JUMP_CAP.maxJump);
  return {
    factors: values.map((v) => (v > line ? line / v : 1)),
    aboveHistory: values.map((v) => v > line),
    baselineAfter: sessionBest === null ? baseline : Math.max(baseline, Math.min(sessionBest, line)),
  };
}

/** The baseline after replaying these earlier sessions (oldest first) through judgeSession. */
export function jumpBaseline(sessions: number[][]): number | null {
  return sessions.reduce<number | null>((baseline, values) => judgeSession(baseline, values).baselineAfter, null);
}

/** A set's XP after the jump cap, rounded like set XP. */
export function jumpCappedXp(xp: number, factor: number): number {
  return Math.round(xp * factor);
}

// --- Daily cap ------------------------------------------------------------------------
//
// Full XP up to a daily limit, then 25% beyond it, and never more than twice the limit
// awarded in one day. A soft cap rewards a genuinely big day without making a fake
// 1,000-pull-up day worth it. 3,100 was chosen with the simulation as the smallest limit
// (in steps of 100) that caps no honest player more than 3 days a year: the biggest honest
// day is a 100 kg advanced lifter's leg day, 3,014. (2,500 capped them every session.)
//
// The cap's DAY is the local calendar day the workout started (xp_event.earned_on), and
// the server locks the player's profile row before counting it, so two Finishes sent
// together run one after the other and can't both see room under the cap.

export const DAILY_XP_CAP = {
  /** Set XP per day at the full rate. */
  limit: 3100,
  /** The share of XP beyond the limit that is still awarded. */
  bandRate: 0.25,
  /** Never more than limit x this awarded in one day. */
  ceilingMultiple: 2,
} as const;

/**
 * The ledger sources the daily cap applies to. Weekly and streak bonuses are deliberately
 * NOT in it: hitting your goal on a big day shouldn't cost you the bonus.
 */
export const XP_SOURCES_UNDER_DAILY_CAP = ["workout_set"] as const;

export type DailyCapResult = {
  /** Per set, in the order given: the XP actually awarded. */
  awarded: number[];
  /** XP the cap held back from these sets (shown to the player so a capped day doesn't feel like a bug). */
  heldBack: number;
};

/**
 * Applies the daily cap to a workout's set XP, in the order the sets were completed.
 * `dayXpBefore` = set XP already AWARDED that day (from earlier workouts).
 *
 * Each set takes its full-rate share first (up to the limit), then 25% of the rest
 * (rounded like set XP), stopping at the ceiling. Rounding per set can lose up to half
 * an XP on a set in the 25% band; in exchange each ledger row can be explained on its own.
 */
export function applyDailyCap(
  dayXpBefore: number,
  setXp: number[],
  /** The cap's values: the server's own constants, or (in the app) the ones the server sent. */
  cap: { limit: number; bandRate: number; ceilingMultiple: number } = DAILY_XP_CAP,
): DailyCapResult {
  const { limit, bandRate, ceilingMultiple } = cap;
  const ceiling = limit * ceilingMultiple;
  let day = dayXpBefore;
  let heldBack = 0;
  const awarded = setXp.map((xp) => {
    const full = Math.min(xp, Math.max(0, limit - day));
    const band = Math.min(Math.round((xp - full) * bandRate), Math.max(0, ceiling - day - full));
    const amount = full + band;
    day += amount;
    heldBack += xp - amount;
    return amount;
  });
  return { awarded, heldBack };
}

// --- Old workouts earn no XP ----------------------------------------------------------
//
// startedAt comes from the phone, so a cheat could spread fake workouts over past days,
// each under its own daily cap. A workout that started more than 14 days before the
// server received it is still saved (history, PRs) but earns no set XP. Saved rather than
// rejected, so the outbox never retries it forever. Future start times are already
// rejected by the Finish schema.

/** A workout may sync this long after it started and still earn XP. */
export const XP_MAX_WORKOUT_AGE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** True if the workout started more than 14 days before the server received it. */
export function isTooOldForXp(startedAt: string | Date, receivedAt: string | Date): boolean {
  return new Date(receivedAt).getTime() - new Date(startedAt).getTime() > XP_MAX_WORKOUT_AGE_DAYS * DAY_MS;
}
