import {
  formatWeight,
  levelProgress,
  liftedKg,
  setXp,
  toDisplayWeight,
  volumeKg,
  type Exercise,
  type FinishSummary,
  type WeightUnit,
} from "@levelup/shared";
import { parseSet, type ActiveWorkout } from "./active-workout";
import { formatSet } from "./format";

// What the workout summary shows, worked out from the server's summary (or, before the
// workout has synced, from the workout itself). Plain functions, unit-tested.

export type Comparison = { text: string; better: boolean };

/** "3 min faster" / "2 min longer" / "Same as last" (within a minute). Faster isn't "better": no colour. */
export function compareDuration(seconds: number, previous: number | null): Comparison | null {
  if (previous === null) return null;
  const diff = seconds - previous;
  if (Math.abs(diff) < 60) return { text: "Same as last", better: false };
  const minutes = Math.round(diff / 60);
  return { text: `${Math.abs(minutes)} min ${minutes < 0 ? "faster" : "longer"}`, better: false };
}

/** "+2 vs last" / "−1 vs last" / "Same as last". */
export function compareCount(count: number, previous: number | null): Comparison | null {
  if (previous === null) return null;
  const diff = count - previous;
  if (diff === 0) return { text: "Same as last", better: false };
  return { text: `${diff > 0 ? "+" : "−"}${Math.abs(diff)} vs last`, better: diff > 0 };
}

/** "+4% vs last" (green when up) / "−3% vs last" / "Same as last". */
export function compareVolume(volume: number, previous: number | null): Comparison | null {
  if (previous === null || previous === 0) return null;
  const percent = Math.round(((volume - previous) / previous) * 100);
  if (percent === 0) return { text: "Same as last", better: false };
  return { text: `${percent > 0 ? "+" : "−"}${Math.abs(percent)}% vs last`, better: percent > 0 };
}

/** "7,420": whole numbers with a thousands separator, in the player's unit. */
export function volumeText(volumeKg: number, unit: WeightUnit): string {
  return Math.round(toDisplayWeight(volumeKg, unit)).toLocaleString("en-US");
}

export type LevelBar = {
  level: number;
  leveledUp: boolean;
  /** Share of this level done BEFORE the workout (purple), and what it added (ice). */
  before: number;
  gained: number;
  /** "2,952 / 3,000 XP" and "48 XP to level 8". */
  progressText: string;
  toNextText: string;
};

/**
 * The level bar after the workout. If the workout crossed into a new level, everything
 * shown in the new level is this workout's gain.
 */
export function levelBar(totalBefore: number, totalAfter: number): LevelBar {
  const after = levelProgress(totalAfter);
  const leveledUp = after.level > levelProgress(totalBefore).level;
  const span = after.nextLevelXp - after.levelStartXp;
  const before = leveledUp ? 0 : (totalBefore - after.levelStartXp) / span;
  const n = (v: number) => v.toLocaleString("en-US");
  return {
    level: after.level,
    leveledUp,
    before,
    gained: after.progress - before,
    progressText: `${n(totalAfter)} / ${n(after.nextLevelXp)} XP`,
    toNextText: `${n(after.nextLevelXp - totalAfter)} XP to level ${after.level + 1}`,
  };
}

type Pr = FinishSummary["prs"][number];

/** One PR line: "Bench Press" / "65 kg × 6 · est. 1RM" / "78 kg" / "was 76". */
export function prLine(pr: Pr, exercise: Pick<Exercise, "equipment" | "repsUnit"> | undefined, unit: WeightUnit) {
  const set = exercise ? formatSet(pr.set, exercise, unit) : `${pr.set.reps}`;
  switch (pr.kind) {
    case "e1rm":
      return {
        detail: `${set} · est. 1RM`,
        value: formatWeight(pr.value, unit, { decimals: 0 }),
        was: `was ${Math.round(toDisplayWeight(pr.previousValue, unit))}`,
      };
    case "reps_at_weight":
      return { detail: `Most reps at ${formatWeight(pr.set.weightKg, unit, { bodyweight: exercise?.equipment === "bodyweight" })}`, value: `${pr.value} reps`, was: `was ${pr.previousValue}` };
    case "longest_hold":
      return { detail: "Longest hold", value: `${pr.value} s`, was: `was ${pr.previousValue} s` };
  }
}

/** "2 new personal records" / "1 new personal record". */
export const prHeading = (count: number) => `${count} new personal ${count === 1 ? "record" : "records"}`;

/**
 * Before the workout reaches the server: what the phone can work out itself, with the
 * same shared formulas (XP for sets, duration, sets, volume). Level, PRs, bonuses and
 * "vs last time" wait for the server.
 */
export function previewSummary(workout: ActiveWorkout, finishedAt: string, bodyweightKg: number) {
  const done = workout.exercises.flatMap((draft) =>
    draft.sets.flatMap((set) => {
      if (set.doneAt === null) return [];
      const parsed = parseSet(set, draft.exercise, workout.weightUnit);
      return parsed.ok ? [{ ...parsed.value, exercise: draft.exercise }] : [];
    }),
  );
  return {
    xpSets: done.reduce((sum, d) => sum + setXp(d, bodyweightKg, d.exercise), 0),
    durationSec: Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(workout.startedAt)) / 1000)),
    setCount: done.length,
    volumeKg: volumeKg(
      done.filter((d) => d.exercise.repsUnit === "reps").map((d) => ({ reps: d.reps, loadKg: liftedKg(d.weightKg, bodyweightKg, d.exercise.bodyweightRatio) })),
    ),
  };
}
