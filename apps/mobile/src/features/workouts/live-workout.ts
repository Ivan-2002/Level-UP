import {
  applyDailyCap,
  estimatedOneRepMax,
  isBaselineSession,
  JUMP_CAP_TEXT,
  liftedKg,
  scoreSessionSets,
  setTagText,
  toDisplayWeight,
  type DailyCapConfig,
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
import { capitalise, formatRest } from "./format";
import { parseSet, type ActiveWorkout, type DraftExercise, type DraftSet, type PinnedScoring } from "./active-workout";

// What the active workout screen SHOWS, worked out from the workout in progress: live XP,
// sets left, progress segments, PRs as they happen, "Next: ...", last time's numbers and
// the 1RM chart. Plain functions, unit-tested.
//
// These are previews. The server recalculates XP and PRs on Finish and is the only one
// that awards anything (the app uses the same shared formulas, so they normally agree).

type Done = { set: DraftSet; reps: number; weightKg: number };

/**
 * The completed sets of an exercise, parsed from the values each is SCORED with
 * (DraftSet.scored: as ticked, or as last committed when editing ended), not what's typed
 * right now. So the live XP, PRs and today's best don't move while a done set is edited.
 */
function doneSets(draft: DraftExercise, unit: WeightUnit): Done[] {
  return draft.sets.flatMap((set) => {
    if (set.doneAt === null || set.scored === null) return [];
    const parsed = parseSet({ ...set, ...set.scored }, draft.exercise, unit);
    return parsed.ok ? [{ set, ...parsed.value }] : [];
  });
}

/** What scoring a workout in progress needs besides the workout: the player's history and bodyweights. */
export type LiveScoringContext = {
  /** Each exercise's 12-week best and jump baseline (GET /v1/exercises/xp-history, cached). */
  history: Map<string, ExerciseXpHistory>;
  /** `xp`: the XP bodyweight (profile.xpBodyweightKg); `typed`: the real one (profile.bodyweightKg), for lifted kg. */
  bodyweight: { xp: number; typed: number };
  /** The daily cap with the server's values, and the set XP already counted on the workout's day; null = no cap data. */
  dailyCap: LiveDailyCap | null;
};

export type LiveDailyCap = { config: DailyCapConfig; xpBefore: number };

export type LiveScore = {
  /** Set XP so far, after the daily cap (not the 14-day rule: a workout in progress is today's). */
  total: number;
  /** Each done set's XP (after the daily cap, as the summary shows it), effort and tag, by its draft set id. */
  bySet: Map<string, ScoredSet>;
  /** Set XP the daily cap holds back, and the line that says so (null when nothing is held back). */
  heldBack: number;
  dailyCapNote: string | null;
  /** Per exercise, for the NEXT session: what the cached history becomes after this Finish. */
  exercises: SessionScore["exercises"];
};

/**
 * Scores the done sets with the shared pipeline (scoreSessionSets), as Finish sends them
 * (buildFinishPayload: exercise by exercise, each set with its doneAt as completedAt), so
 * both score each exercise's sets in the order they were ticked. Then the daily cap, in
 * the order the server applies it (the order sent), from the XP already counted that day.
 * So the preview matches the server's number, except when the pinned day count is out of
 * date (another phone trained today) or the cached copy has no cap data.
 */
export function scoreLiveWorkout(workout: ActiveWorkout, context: LiveScoringContext): LiveScore {
  const done = workout.exercises.flatMap((draft) => doneSets(draft, workout.weightUnit).map((d) => ({ exerciseId: draft.exercise.id, ...d })));
  const score = scoreSessionSets({
    sets: done.map((d) => ({ exerciseId: d.exerciseId, reps: d.reps, weightKg: d.weightKg, completedAt: d.set.doneAt })),
    exercises: new Map(workout.exercises.map((draft) => [draft.exercise.id, draft.exercise])),
    history: context.history,
    bodyweight: context.bodyweight,
  });
  const cap = context.dailyCap;
  const capped = cap ? applyDailyCap(cap.xpBefore, score.sets.map((s) => s.xp), cap.config) : null;
  const sets = capped ? score.sets.map((s, i) => ({ ...s, xp: capped.awarded[i]! })) : score.sets;
  const total = sets.reduce((sum, s) => sum + s.xp, 0);
  return {
    total,
    bySet: new Map(done.map((d, i) => [d.set.id, sets[i]!])),
    heldBack: capped?.heldBack ?? 0,
    dailyCapNote: cap && capped && capped.heldBack > 0 ? dailyCapNote(cap.config, cap.xpBefore + total) : null,
    exercises: score.exercises,
  };
}

/** The line under the tiles once the daily cap holds XP back. */
export function dailyCapNote(config: DailyCapConfig, dayXpAfter: number): string {
  if (dayXpAfter >= config.limit * config.ceilingMultiple) return "Daily maximum reached: sets earn no more XP today";
  return `Daily limit reached: sets now earn ${Math.round(config.bandRate * 100)}%`;
}

/**
 * The scoring context a workout is previewed with is PINNED per workout: taken once, when
 * the history first arrives (or when the first set is ticked, if it hasn't by then), and
 * saved with the workout (ActiveWorkout.scoring), so it survives leaving the screen and
 * the app being killed. Without this, a background refetch (the profile, or the history
 * after an earlier workout syncs) or reopening the screen would shift the total mid-workout;
 * pinned, the total only changes when the player ticks or edits a set.
 *
 * Returns the snapshot to pin now, or null: already pinned, or still waiting for the history.
 */
export function snapshotToPin(
  workout: Pick<ActiveWorkout, "exercises" | "scoring">,
  available: {
    history: LiveScoringContext["history"] | undefined;
    bodyweight: LiveScoringContext["bodyweight"];
    /** Null when there's no cap data (an old saved copy, or no history yet). */
    dailyCap: LiveDailyCap | null;
  },
): PinnedScoring | null {
  if (workout.scoring !== null) return null;
  const anyDone = workout.exercises.some((e) => e.sets.some((s) => s.doneAt !== null));
  if (available.history === undefined && !anyDone) return null; // wait a little for the history
  const history = [...(available.history ?? new Map<string, ExerciseXpHistory>())].map(([exerciseId, h]) => ({ exerciseId, ...h }));
  return { history, bodyweight: available.bodyweight, dailyCap: available.history === undefined ? null : available.dailyCap };
}

/** The saved snapshot as the context scoreLiveWorkout takes. */
export function scoringContext(scoring: PinnedScoring): LiveScoringContext {
  return {
    history: new Map(scoring.history.map((h) => [h.exerciseId, { recentBest: h.recentBest, jumpBaseline: h.jumpBaseline }])),
    bodyweight: scoring.bodyweight,
    dailyCap: scoring.dailyCap,
  };
}

/** The line under a done set: its XP and why it's lower, if it is ("+12 XP · Warm-up"). */
export type SetXpNote = { text: string; tone: "inkMuted" | "danger"; detail?: string };

export function setXpNote(score: ScoredSet): SetXpNote {
  if (score.isFlagged) return { text: `0 XP · ${setTagText("check_set")}`, tone: "danger" };
  const text = score.tag ? `+${score.xp} XP · ${setTagText(score.tag)}` : `+${score.xp} XP`;
  return score.tag === "above_history" ? { text, tone: "inkMuted", detail: JUMP_CAP_TEXT } : { text, tone: "inkMuted" };
}

// --- Feedback when a set is ticked --------------------------------------------------

/** "3 earlier sets now warm-ups" / "1 earlier set now a warm-up". */
const rescoredText = (n: number) => (n === 1 ? "1 earlier set now a warm-up" : `${n} earlier sets now warm-ups`);

export type TickFeedback = {
  /** Read out by the screen reader on every tick, so a drop in the total is heard too. */
  announcement: string;
  /** Earlier done sets this tick turned into warm-ups (only in a baseline session). */
  rescoredAsWarmUps: number;
};

/**
 * What a tick or untick of set `setNumber` changed, from the live score before and after:
 * "Set 4 done, plus 85 XP, 115 total. 3 earlier sets now warm-ups." It leads with the
 * set's own gain; the total already carries the net change (no "-123").
 * `before`/`after` null: no score yet (nothing pinned), so just the tick itself.
 */
export function tickFeedback(input: {
  setId: string;
  setNumber: number;
  /** Whether the set is done after the tap (a tick) or not (an untick). */
  done: boolean;
  before: LiveScore | null;
  after: LiveScore | null;
}): TickFeedback {
  const { setId, setNumber, done, before, after } = input;
  const score = after?.bySet.get(setId);
  if (!before || !after) return { announcement: `Set ${setNumber} ${done ? "done" : "not done"}`, rescoredAsWarmUps: 0 };
  if (!done || !score) return { announcement: `Set ${setNumber} not done, ${after.total} total`, rescoredAsWarmUps: 0 };

  let rescored = 0;
  for (const [id, was] of before.bySet) {
    if (id !== setId && was.tag !== "warm_up" && after.bySet.get(id)?.tag === "warm_up") rescored++;
  }
  const parts = [`Set ${setNumber} done, plus ${score.xp} XP, ${after.total} total.`];
  if (rescored > 0) parts.push(`${capitalise(rescoredText(rescored))}.`);
  if (after.dailyCapNote && !before.dailyCapNote) parts.push(`${after.dailyCapNote}.`);
  return { announcement: parts.join(" "), rescoredAsWarmUps: rescored };
}

/** The ticked row's line while it's the latest tick: "+85 XP · 3 earlier sets now warm-ups". */
export function tickLine(note: SetXpNote, rescoredAsWarmUps: number): SetXpNote {
  return rescoredAsWarmUps > 0 ? { ...note, text: `${note.text} · ${rescoredText(rescoredAsWarmUps)}` } : note;
}

/** The caption on an exercise in a baseline session (its first, or the first after 12 weeks off). */
export const BASELINE_CAPTION = "First session: this sets your baseline. Earlier sets may be re-scored as warm-ups.";

/** Whether the exercise on screen gets the baseline caption: a reps exercise with no 12-week best in the pinned history. */
export function showsBaselineCaption(exercise: Pick<Exercise, "id" | "repsUnit">, context: LiveScoringContext | null): boolean {
  if (!context || exercise.repsUnit !== "reps") return false; // timed sets have no warm-ups
  return isBaselineSession(context.history.get(exercise.id)?.recentBest ?? null);
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
