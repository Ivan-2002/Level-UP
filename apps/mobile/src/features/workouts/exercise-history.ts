import {
  addToRecordBook,
  emptyRecordBook,
  findNewRecords,
  formatWeight,
  liftedKg,
  toDisplayWeight,
  type Exercise,
  type ExerciseSession,
  type RecordBook,
  type WeightUnit,
} from "@levelup/shared";
import type { ChartBar } from "./live-workout";
import { volumeText } from "./summary-view";

// The Exercise history screen's rules: the trend for a time range, the change over it,
// and which logged sets were PRs when they were done. Plain functions, unit-tested.

export const RANGES = ["1M", "3M", "1Y"] as const;
export type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Range, number> = { "1M": 31, "3M": 92, "1Y": 366 };
const MAX_BARS = 12;
const DAY = 86_400_000;

type Point = { at: number; value: number };

/**
 * Estimated 1RM per session within the range, oldest first. More than 12 sessions are
 * grouped by week (each week's best), so a year still reads as a chart, not 100 slivers.
 * The latest bar is highlighted: purple when it's the best in the range.
 */
export function trend(
  sessionsNewestFirst: ExerciseSession[],
  range: Range,
  now: Date,
): { bars: ChartBar[]; changeKg: number | null; weeks: number } {
  const from = now.getTime() - RANGE_DAYS[range] * DAY;
  let points: Point[] = sessionsNewestFirst
    .filter((s) => s.bestE1rm !== null && Date.parse(s.startedAt) >= from)
    .map((s) => ({ at: Date.parse(s.startedAt), value: s.bestE1rm! }))
    .reverse();

  if (points.length > MAX_BARS) {
    const weeks = new Map<number, Point>();
    for (const p of points) {
      const week = Math.floor((p.at - from) / (7 * DAY));
      const best = weeks.get(week);
      if (!best || p.value > best.value) weeks.set(week, { at: p.at, value: Math.max(p.value, best?.value ?? 0) });
    }
    points = [...weeks.values()].sort((a, b) => a.at - b.at).slice(-MAX_BARS);
  }

  const best = Math.max(0, ...points.map((p) => p.value));
  const bars: ChartBar[] = points.map((p, i) => ({
    label: new Date(p.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    value: p.value,
    tone: i < points.length - 1 ? "past" : p.value >= best && points.length > 1 ? "today_pr" : "today",
  }));
  const first = points[0];
  const last = points.at(-1);
  return {
    bars,
    changeKg: first && last && points.length > 1 ? last.value - first.value : null,
    weeks: first && last ? Math.max(1, Math.round((last.at - first.at) / (7 * DAY))) : 0,
  };
}

/** "+9 kg in 8 weeks" / "−2 kg in 3 weeks" / "No change in 2 weeks". */
export function changeText(changeKg: number, weeks: number, unit: WeightUnit): string {
  const span = `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  const amount = Math.round(toDisplayWeight(Math.abs(changeKg), unit));
  if (amount === 0) return `No change in ${span}`;
  return `${changeKg > 0 ? "+" : "−"}${amount} ${unit} in ${span}`;
}

/**
 * Which sets were PRs at the time, per session (by workout id): replays history oldest
 * first through the SAME shared record rules the server uses, with each session's own
 * bodyweight. The first session only sets the baseline.
 */
export function prSets(
  sessionsNewestFirst: ExerciseSession[],
  exercise: Pick<Exercise, "repsUnit" | "bodyweightRatio">,
): Map<string, boolean[]> {
  const flags = new Map<string, boolean[]>();
  let book: RecordBook = emptyRecordBook();
  for (const session of [...sessionsNewestFirst].reverse()) {
    const sets = session.sets.map((s) => ({
      reps: s.reps,
      loadKg: liftedKg(s.weightKg, session.bodyweightKg, exercise.bodyweightRatio),
    }));
    const records = new Set(findNewRecords(book, sets, exercise.repsUnit).map((r) => r.index));
    flags.set(
      session.workoutId,
      sets.map((_, i) => records.has(i)),
    );
    book = addToRecordBook(book, sets, exercise.repsUnit);
  }
  return flags;
}

/** A session's one-line summary: "1,840 kg · est. 1RM 76", or the best hold for a timed exercise. */
export function sessionLine(session: ExerciseSession, exercise: Pick<Exercise, "repsUnit">, unit: WeightUnit): string {
  if (exercise.repsUnit === "seconds") return `Best hold ${Math.max(0, ...session.sets.map((s) => s.reps))} s`;
  const parts = [`${volumeText(session.volumeKg, unit)} ${unit}`];
  if (session.bestE1rm !== null)
    parts.push(`est. 1RM ${formatWeight(session.bestE1rm, unit, { decimals: 0 }).replace(` ${unit}`, "")}`);
  return parts.join(" · ");
}
