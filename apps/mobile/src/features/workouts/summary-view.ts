import {
  formatWeight,
  JUMP_CAP_TEXT,
  liftedKg,
  setTagText,
  toDisplayWeight,
  volumeKg,
  type Exercise,
  type FinishSummary,
  type LevelStatus,
  type WeightUnit,
  type WorkoutDetail,
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
  /** Levels this workout gained (0 = none). */
  levelsGained: number;
  /** "Level 6", or "Level 4 → 6" when more than one level was gained. */
  levelText: string;
  /** "Level up! You reached level 6." (or "went from level 4 to 6"); null without a level up. */
  levelUpText: string | null;
  /** Share of this level done BEFORE the workout (purple), and what it added (ice). */
  before: number;
  gained: number;
  /** "1,240 / 3,000 XP" (this level's numbers) and "1,760 XP to level 6". */
  progressText: string;
  toNextText: string;
};

const n = (v: number) => v.toLocaleString("en-US");

/**
 * The level bar after the workout, from the server's level status before and after it
 * (the server owns the curve: the phone never works out a level itself). If the workout
 * crossed into a new level, the bar shows only the new level: all of it is this workout's gain.
 */
export function levelBar(statusBefore: LevelStatus, statusAfter: LevelStatus): LevelBar {
  const levelsGained = Math.max(0, statusAfter.level - statusBefore.level);
  const before = levelsGained > 0 ? 0 : statusBefore.xpIntoLevel / statusAfter.xpForNextLevel;
  return {
    level: statusAfter.level,
    levelsGained,
    levelText: levelsGained > 1 ? `Level ${statusBefore.level} → ${statusAfter.level}` : `Level ${statusAfter.level}`,
    levelUpText:
      levelsGained === 0
        ? null
        : levelsGained === 1
          ? `Level up! You reached level ${statusAfter.level}.`
          : `Level up! You went from level ${statusBefore.level} to ${statusAfter.level}.`,
    before,
    gained: statusAfter.xpIntoLevel / statusAfter.xpForNextLevel - before,
    progressText: `${n(statusAfter.xpIntoLevel)} / ${n(statusAfter.xpForNextLevel)} XP`,
    toNextText: `${n(statusAfter.xpForNextLevel - statusAfter.xpIntoLevel)} XP to level ${statusAfter.level + 1}`,
  };
}

export type XpLine = { label: string; amount: number };

/**
 * The XP card once the server has answered: the total as the headline, then the breakdown.
 * "XP for sets" is always the first line, labelled as the estimate's headline is, so the
 * two compare; each bonus (weekly goal, streak), which the estimate leaves out, follows.
 */
export function xpLines(summary: Pick<FinishSummary, "xp" | "weeklyGoal">): { headline: XpLine; breakdown: XpLine[] } {
  const breakdown: XpLine[] = [{ label: "XP for sets", amount: summary.xp.sets }];
  if (summary.xp.weeklyGoal > 0) breakdown.push({ label: "Weekly goal met", amount: summary.xp.weeklyGoal });
  if (summary.xp.streakMilestone > 0) breakdown.push({ label: `${summary.weeklyGoal?.streak ?? ""}-week streak bonus`, amount: summary.xp.streakMilestone });
  return { headline: { label: "Total XP earned", amount: summary.xp.total }, breakdown };
}

/** The line for set XP the workout didn't get; null when it got everything. */
export function heldBackText(heldBack: FinishSummary["xp"]["heldBack"]): string | null {
  if (!heldBack) return null;
  return heldBack.reason === "daily_cap"
    ? `${n(heldBack.amount)} XP held back: daily limit reached.`
    : "No XP for sets: it synced more than 14 days after it started.";
}

export type TaggedSet = { text: string; tone: "inkMuted" | "danger"; detail?: string };
export type ExerciseXpRow = { key: string; name: string; xp: number; tagged: TaggedSet[] };

/**
 * XP per exercise from the server's answer, with only the sets that have a tag (warm-ups,
 * easy sets, jump-capped, beyond 10 sets, flagged): a normal workout stays short. An
 * exercise logged twice (a superset) is two rows, as in the workout.
 */
export function exerciseXpRows(workout: Pick<WorkoutDetail, "exercises">, sets: FinishSummary["sets"]): ExerciseXpRow[] {
  const bySet = new Map(sets.map((s) => [s.setId, s]));
  return workout.exercises.map((e) => {
    const scored = e.sets.map((set) => bySet.get(set.id));
    const tagged = scored.flatMap((s, i): TaggedSet[] => {
      if (!s?.tag) return [];
      const label = `Set ${i + 1} · ${setTagText(s.tag)}`;
      if (s.tag === "check_set") return [{ text: `${label} · 0 XP`, tone: "danger" }];
      const text = `${label} · +${s.xp} XP`;
      return [s.tag === "above_history" ? { text, tone: "inkMuted", detail: JUMP_CAP_TEXT } : { text, tone: "inkMuted" }];
    });
    return { key: e.id, name: e.exercise.name, xp: scored.reduce((sum, s) => sum + (s?.xp ?? 0), 0), tagged };
  });
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

export type PendingLevelBar = {
  level: number;
  /** Share of the level done before the workout (purple), and the estimate's share (lighter), never past the end. */
  before: number;
  pending: number;
  /** "1,240 / 3,000 XP": this level's numbers, as the server's status gives them. */
  progressText: string;
  /** "About 1,760 XP to level 6", or, when the estimate reaches the end, that the server confirms it. */
  toNextText: string;
};

/**
 * The level bar before the server answers: the level status cached at Finish plus the
 * estimated set XP. The estimate stops at the end of the level: whether it levels up is
 * the server's to say (it adds bonuses, and owns the curve), so there's never a "Level up!" here.
 */
export function pendingLevelBar(status: LevelStatus, estimatedXp: number): PendingLevelBar {
  const room = status.xpForNextLevel - status.xpIntoLevel;
  const shown = Math.max(0, Math.min(estimatedXp, room));
  return {
    level: status.level,
    before: status.xpIntoLevel / status.xpForNextLevel,
    pending: shown / status.xpForNextLevel,
    progressText: `${n(status.xpIntoLevel + shown)} / ${n(status.xpForNextLevel)} XP`,
    toNextText: estimatedXp >= room ? "Your level is confirmed when it syncs" : `About ${n(room - shown)} XP to level ${status.level + 1}`,
  };
}

/**
 * Before the workout reaches the server: what the phone can work out itself from the
 * workout as sent (duration, sets, volume). Its XP is the live score saved at Finish
 * (FinishedWorkout.preview); level, PRs, bonuses and "vs last time" wait for the server.
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
    durationSec: Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(workout.startedAt)) / 1000)),
    setCount: done.length,
    volumeKg: volumeKg(
      done.filter((d) => d.exercise.repsUnit === "reps").map((d) => ({ reps: d.reps, loadKg: liftedKg(d.weightKg, bodyweightKg, d.exercise.bodyweightRatio) })),
    ),
  };
}
