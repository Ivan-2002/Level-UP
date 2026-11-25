import type { ScoredSet } from "./set-scoring.js";
import { BODY_PARTS, type BodyPart } from "./workouts.js";

// ---------------------------------------------------------------------------
// Body-part development (docs/ARCHITECTURE.md, "Avatar prototype": development).
//
// A body part grows from its TRAINING DOSE, the hard sets it got, not from the XP of those
// sets (XP is effort × strength, so on XP a strong lifter's set counts three times a
// beginner's). Each set's stimulus is its effort; the ledger stores it per set
// (xp_event.stimulus), dated by earned_on. This file turns those dated stimuli into a
// development value from 0 to 1, on any day, with no stored state: it is recalculated on
// every read, like the weekly goal.
//
// The walk, day by day from the Monday of the first stimulus:
//   - a day with at least `trainedDayStimulus` is a TRAINED day (no decline that day);
//   - after `graceDays` without a trained day, each day multiplies progress by
//     (declineDays − j) / (declineDays − j + 1), j = the day of the decline (1, 2, ...).
//     The product telescopes: with no growth in between, progress falls in a STRAIGHT LINE
//     to 0 on day `declineDays` of the decline, a year after the last training.
//   - at the end of each Monday-to-Sunday week (and on the evaluation day, for the week so
//     far), progress closes part of its gap to 1: p += (1 − p) × rate × (1 − e^(−dose / halfDose)).
//
// Why a daily FACTOR and not "minus (the value when the decline began) ÷ 351 a day": the
// two are identical when nothing is logged during a break, but the second remembers a value
// from the past, and with small sets logged during a break a history with MORE sets could
// end up LOWER. Here every daily step is order-preserving (a higher progress stays higher)
// and depends only on the days since the last training, which adding a set can only
// shorten, so adding a set never lowers development on any day (property-tested).
// ---------------------------------------------------------------------------

export const DEVELOPMENT = {
  /** The most a week can close of the gap to 1 (with unlimited hard sets). */
  rate: 0.04,
  /** The weekly dose at which a week does 63% of its maximum: 1 − e^(−dose / halfDose). */
  halfDose: 8,
  /** Days after the last trained day before a part starts to decline. */
  graceDays: 14,
  /** Days of decline that bring a part back to its starting shape (14 + 351 = a year). */
  declineDays: 351,
  /** A day with at least this much stimulus for a part (about one hard set) is a trained day. */
  trainedDayStimulus: 1,
} as const;

/** One local day's summed stimulus for one body part ("YYYY-MM-DD"). */
export type StimulusDay = { day: string; stimulus: number };

/**
 * A set's growth stimulus: its effort (0 to 1; timed sets count 1), or 0 for a warm-up, a
 * flagged set or a set beyond the 10-set limit. Easy sets count with their (low) effort.
 */
export function setStimulus(set: Pick<ScoredSet, "effort" | "tag" | "isFlagged">): number {
  if (set.isFlagged || set.tag === "warm_up" || set.tag === "beyond_set_limit") return 0;
  return Math.min(1, Math.max(0, set.effort));
}

/** How much of a week's maximum growth a dose earns: 6 sets 0.53, 10 sets 0.71, 20 sets 0.92. */
export function weeklyResponse(dose: number): number {
  return dose <= 0 ? 0 : 1 - Math.exp(-dose / DEVELOPMENT.halfDose);
}

/** The factor for day `j` of a decline (j ≤ 0: no decline; j ≥ declineDays: back to 0). */
export function declineFactor(j: number): number {
  if (j <= 0) return 1;
  const left = DEVELOPMENT.declineDays - j;
  return left <= 0 ? 0 : left / (left + 1);
}

/**
 * Progress (0 to 1, before the starting shape) on every day from `from` to `to`, with the
 * last trained day as of each. `from` should be on or before the first stimulus (it starts
 * the walk at 0); days outside the range are ignored.
 */
export function progressSeries(
  days: readonly StimulusDay[],
  from: string,
  to: string,
): { day: string; progress: number; lastTrainedOn: string | null }[] {
  const first = mondayOf(dayNumber(from));
  const last = dayNumber(to);
  const byDay = new Map<number, number>();
  for (const { day, stimulus } of days) {
    const n = dayNumber(day);
    if (n >= first && n <= last) byDay.set(n, (byDay.get(n) ?? 0) + stimulus);
  }

  const series: { day: string; progress: number; lastTrainedOn: string | null }[] = [];
  const { rate, graceDays, trainedDayStimulus } = DEVELOPMENT;
  let p = 0;
  let lastTrained: number | null = null;
  let dose = 0;
  for (let n = first; n <= last; n++) {
    const stimulus = byDay.get(n) ?? 0;
    if (stimulus >= trainedDayStimulus) lastTrained = n;
    else if (lastTrained !== null) p *= declineFactor(n - lastTrained - graceDays);
    dose += stimulus;
    // The week so far counts on every day; the week's growth is kept at its end (Sunday).
    const withWeek = p + (1 - p) * rate * weeklyResponse(dose);
    if (weekday(n) === 6) {
      p = withWeek;
      dose = 0;
    }
    if (n >= dayNumber(from)) {
      series.push({
        day: dayString(n),
        progress: withWeek,
        lastTrainedOn: lastTrained === null ? null : dayString(lastTrained),
      });
    }
  }
  return series;
}

/**
 * A part's development on `today` from its dated stimuli: start + (1 − start) × progress,
 * where `start` is its starting shape (0 until the starting-shape calibration, 6d).
 * Stimuli after `today` are ignored.
 */
export function partDevelopment(
  days: readonly StimulusDay[],
  today: string,
  start = 0,
): { development: number; lastTrainedOn: string | null } {
  const earliest = days.reduce<string | null>(
    (min, d) => (d.day <= today && (min === null || d.day < min) ? d.day : min),
    null,
  );
  if (earliest === null) return { development: start, lastTrainedOn: null };
  const last = progressSeries(days, earliest, today).at(-1)!;
  return { development: start + (1 - start) * last.progress, lastTrainedOn: last.lastTrainedOn };
}

export type DevelopmentByPart = {
  development: Record<BodyPart, number>;
  lastTrainedOn: Record<BodyPart, string | null>;
};

/** Every body part's development on `today`, from the ledger's rows (body part, local day, stimulus). */
export function developmentByPart(
  rows: readonly { bodyPart: BodyPart; day: string; stimulus: number }[],
  today: string,
  starts: Partial<Record<BodyPart, number>> = {},
): DevelopmentByPart {
  const development = {} as Record<BodyPart, number>;
  const lastTrainedOn = {} as Record<BodyPart, string | null>;
  for (const part of BODY_PARTS) {
    const days = rows.filter((r) => r.bodyPart === part);
    const result = partDevelopment(days, today, starts[part] ?? 0);
    development[part] = result.development;
    lastTrainedOn[part] = result.lastTrainedOn;
  }
  return { development, lastTrainedOn };
}

// Days as whole numbers (days since 1970-01-01, a Thursday), so the walk is integer steps.
const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (day: string) => Math.round(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) / DAY_MS);
const dayString = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
/** 0 = Monday ... 6 = Sunday. */
const weekday = (n: number) => (((n + 3) % 7) + 7) % 7;
const mondayOf = (n: number) => n - weekday(n);
