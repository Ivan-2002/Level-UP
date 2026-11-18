import {
  estimatedOneRepMax,
  JUMP_CAP_TEXT,
  liftedKg,
  scoreSessionSets,
  setTagText,
  toDisplayWeight,
  type Exercise,
  type ExerciseSession,
  type ExerciseXpHistory,
  type LoggedSet,
  type Mechanic,
  type ScoredSet,
  type SessionScore,
  type WeightUnit,
} from "@levelup/shared";
import type { Segment } from "@/components/progress-segments";
import { formatRest } from "./format";
import { parseSet, type ActiveWorkout, type DraftExercise, type DraftSet } from "./active-workout";

// What the active workout screen SHOWS, worked out from the workout in progress: live XP,
// sets left, progress segments, PRs as they happen, "Next: ...", last time's numbers and
// the 1RM chart. Plain functions, unit-tested.
//
// These are previews. The server recalculates XP and PRs on Finish and is the only one
// that awards anything (the app uses the same shared formulas, so they normally agree).

type Done = { set: DraftSet; reps: number; weightKg: number };

/** The completed sets of an exercise, parsed (a set ticked done is always valid). */
function doneSets(draft: DraftExercise, unit: WeightUnit): Done[] {
  return draft.sets.flatMap((set) => {
    if (set.doneAt === null) return [];
    const parsed = parseSet(set, draft.exercise, unit);
    return parsed.ok ? [{ set, ...parsed.value }] : [];
  });
}

/** What scoring a workout in progress needs besides the workout: the player's history and bodyweights. */
export type LiveScoringContext = {
  /** Each exercise's 12-week best and jump baseline (GET /v1/exercises/xp-history, cached). */
  history: Map<string, ExerciseXpHistory>;
  /** `xp`: the XP bodyweight (profile.xpBodyweightKg); `typed`: the real one (profile.bodyweightKg), for lifted kg. */
  bodyweight: { xp: number; typed: number };
};

export type LiveScore = {
  /** Set XP so far. Before the daily cap and the 14-day rule: only the server knows the day. */
  total: number;
  /** Each done set's XP, effort and tag, by its draft set id. */
  bySet: Map<string, ScoredSet>;
  /** Per exercise, for the NEXT session: what the cached history becomes after this Finish. */
  exercises: SessionScore["exercises"];
};

/**
 * Scores the done sets with the shared pipeline (scoreSessionSets), as Finish sends them
 * (buildFinishPayload: exercise by exercise, each set with its doneAt as completedAt), so
 * both score each exercise's sets in the order they were ticked. The preview matches the
 * server's number, except for what only the server can know (the daily cap, the 14-day rule).
 */
export function scoreLiveWorkout(workout: ActiveWorkout, context: LiveScoringContext): LiveScore {
  const done = workout.exercises.flatMap((draft) => doneSets(draft, workout.weightUnit).map((d) => ({ exerciseId: draft.exercise.id, ...d })));
  const score = scoreSessionSets({
    sets: done.map((d) => ({ exerciseId: d.exerciseId, reps: d.reps, weightKg: d.weightKg, completedAt: d.set.doneAt })),
    exercises: new Map(workout.exercises.map((draft) => [draft.exercise.id, draft.exercise])),
    history: context.history,
    bodyweight: context.bodyweight,
  });
  return {
    total: score.sets.reduce((sum, s) => sum + s.xp, 0),
    bySet: new Map(done.map((d, i) => [d.set.id, score.sets[i]!])),
    exercises: score.exercises,
  };
}

/**
 * The scoring context a workout is previewed with, PINNED per workout: taken once, when
 * the history first arrives (or when the first set is ticked, if it hasn't by then), and
 * kept until the workout ends. Without this, a background refetch (the profile, or the
 * history after an earlier workout syncs) would shift the total mid-workout; pinned, the
 * total only changes when the player ticks or edits a set.
 */
export type PinnedContext = { clientId: string; context: LiveScoringContext };

export function pinContext(
  pinned: PinnedContext | null,
  workout: Pick<ActiveWorkout, "clientId" | "exercises">,
  available: { history: LiveScoringContext["history"] | undefined; bodyweight: LiveScoringContext["bodyweight"] },
): PinnedContext | null {
  if (pinned?.clientId === workout.clientId) return pinned;
  const anyDone = workout.exercises.some((e) => e.sets.some((s) => s.doneAt !== null));
  if (available.history === undefined && !anyDone) return null; // wait a little for the history
  return { clientId: workout.clientId, context: { history: available.history ?? new Map(), bodyweight: available.bodyweight } };
}

/** The line under a done set: its XP and why it's lower, if it is ("+12 XP · Warm-up"). */
export type SetXpNote = { text: string; tone: "inkMuted" | "danger"; detail?: string };

export function setXpNote(score: ScoredSet): SetXpNote {
  if (score.isFlagged) return { text: `0 XP · ${setTagText("check_set")}`, tone: "danger" };
  const text = score.tag ? `+${score.xp} XP · ${setTagText(score.tag)}` : `+${score.xp} XP`;
  return score.tag === "above_history" ? { text, tone: "inkMuted", detail: JUMP_CAP_TEXT } : { text, tone: "inkMuted" };
}

/** One progress segment per exercise, plus which one is on screen. */
export function workoutSegments(workout: ActiveWorkout): { segments: Segment[]; currentIndex: number } {
  return {
    segments: workout.exercises.map((e) => ({ total: e.sets.length, done: e.sets.filter((s) => s.doneAt !== null).length })),
    currentIndex: workout.exercises.findIndex((e) => e.id === workout.currentExerciseKey),
  };
}

/** Estimated 1RM of a completed set, on the weight actually lifted (bodyweight included). */
function e1rmOf(done: Done, exercise: Exercise, bodyweightKg: number): number | null {
  if (exercise.repsUnit === "seconds") return null;
  return estimatedOneRepMax(liftedKg(done.weightKg, bodyweightKg, exercise.bodyweightRatio), done.reps);
}

/**
 * Sets that beat the best estimated 1RM so far, in the order they were ticked: each is
 * compared with history AND the earlier sets today, so two sets can both be PRs.
 * With no history (bestBefore null) the first session sets the baseline: no PRs, as on the server.
 */
export function livePrs(draft: DraftExercise, unit: WeightUnit, bodyweightKg: number, bestBefore: number | null): Map<string, number> {
  const prs = new Map<string, number>();
  if (bestBefore === null) return prs;
  let best = bestBefore;
  const inOrder = doneSets(draft, unit).sort((a, b) => Date.parse(a.set.doneAt!) - Date.parse(b.set.doneAt!));
  for (const done of inOrder) {
    const value = e1rmOf(done, draft.exercise, bodyweightKg);
    if (value !== null && value > best) {
      prs.set(done.set.id, value);
      best = value;
    }
  }
  return prs;
}

/** Today's best estimated 1RM for this exercise, or null before a set is done. */
export function todayBestE1rm(draft: DraftExercise, unit: WeightUnit, bodyweightKg: number): number | null {
  const values = doneSets(draft, unit).map((d) => e1rmOf(d, draft.exercise, bodyweightKg)).filter((v): v is number => v !== null);
  return values.length ? Math.max(...values) : null;
}

// --- Text ----------------------------------------------------------------------------

/** A weight in the player's unit, bare (the column header names the unit): "62.5", "BW", "+10". */
function bareWeight(weightKg: number, exercise: Exercise, unit: WeightUnit): string {
  const value = String(toDisplayWeight(weightKg, unit));
  if (exercise.equipment !== "bodyweight") return value;
  return weightKg === 0 ? "BW" : `+${value}`;
}

/** The "Last time" cell for set n: "60 × 8", "BW × 9", "60 s"; a dash if there was no such set. */
export function previousSetText(previous: LoggedSet[] | undefined, index: number, exercise: Exercise, unit: WeightUnit): string {
  const set = previous?.[index];
  if (!set) return "—";
  if (exercise.repsUnit === "seconds") return set.weightKg > 0 ? `${bareWeight(set.weightKg, exercise, unit)} × ${set.reps} s` : `${set.reps} s`;
  return `${bareWeight(set.weightKg, exercise, unit)} × ${set.reps}`;
}

/** The "Last time" chip: "60 kg × 8, 8, 7, 8" (one weight), else each set: "60 × 8, 62.5 × 6". */
export function lastSessionText(previous: LoggedSet[], exercise: Exercise, unit: WeightUnit): string {
  if (previous.length === 0) return "";
  const s = exercise.repsUnit === "seconds" ? " s" : "";
  const weights = new Set(previous.map((p) => p.weightKg));
  if (weights.size === 1) {
    const w = previous[0]!.weightKg;
    const weight = exercise.equipment === "bodyweight" ? (w === 0 ? "BW" : `BW + ${toDisplayWeight(w, unit)} ${unit}`) : `${toDisplayWeight(w, unit)} ${unit}`;
    return `${weight} × ${previous.map((p) => `${p.reps}${s}`).join(", ")}`;
  }
  return previous.map((p) => `${bareWeight(p.weightKg, exercise, unit)} × ${p.reps}${s}`).join(", ");
}

/** A draft set as "62.5 kg × 7" (what's typed, in the workout's unit). */
function plannedText(set: DraftSet, exercise: Exercise, unit: WeightUnit): string {
  const reps = set.reps.trim() || "?";
  const s = exercise.repsUnit === "seconds" ? " s" : "";
  const weight = set.weight.trim();
  if (exercise.equipment === "bodyweight") return `${weight && weight !== "0" ? `BW + ${weight} ${unit}` : "BW"} × ${reps}${s}`;
  return `${weight || "0"} ${unit} × ${reps}${s}`;
}

/**
 * What's next, for the rest bar and the notification: the next open set of this
 * exercise ("set 3 · 62.5 kg × 7"), else the first open set of a later exercise
 * ("Overhead press · 40 kg × 8"), else null (everything's done: time to finish).
 */
export function nextUp(workout: ActiveWorkout): string | null {
  const exercises = workout.exercises;
  const start = Math.max(0, exercises.findIndex((e) => e.id === workout.currentExerciseKey));
  for (let i = 0; i < exercises.length; i++) {
    const draft = exercises[(start + i) % exercises.length]!;
    const index = draft.sets.findIndex((s) => s.doneAt === null);
    if (index < 0) continue;
    const text = plannedText(draft.sets[index]!, draft.exercise, workout.weightUnit);
    return i === 0 ? `set ${index + 1} · ${text}` : `${draft.exercise.name} · ${text}`;
  }
  return null;
}

/** The muted line under "Rest between sets". */
export function suggestedRestText(mechanic: Mechanic): string {
  return mechanic === "compound"
    ? `Suggested ${formatRest(120)}–${formatRest(180)} for compound lifts`
    : `Suggested ${formatRest(45)}–${formatRest(90)} for isolation work`;
}

// --- The 1RM trend chart --------------------------------------------------------------

export type ChartBar = { label: string; value: number | null; tone: "past" | "today" | "today_pr" };

/**
 * The last 5 sessions (oldest left) plus today. Today's bar is purple when it beats
 * every earlier session. Sessions without an estimate (all sets over 12 reps) are skipped.
 */
export function e1rmBars(sessionsNewestFirst: ExerciseSession[], today: number | null, locale = "en-GB"): ChartBar[] {
  const past = sessionsNewestFirst
    .filter((s) => s.bestE1rm !== null)
    .slice(0, 5)
    .reverse()
    .map((s) => ({
      label: new Date(s.startedAt).toLocaleDateString(locale, { day: "numeric", month: "short" }),
      value: s.bestE1rm,
      tone: "past" as const,
    }));
  const bestBefore = Math.max(0, ...past.map((p) => p.value ?? 0));
  const isPr = today !== null && past.length > 0 && today > bestBefore;
  return [...past, { label: "Today", value: today, tone: isPr ? "today_pr" : "today" }];
}
