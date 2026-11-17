import { bodyweightOnDate, liftedKg, setXp, xpBodyweightOnDate, type XpBodyweightEntry } from "../src/progression.js";
import { evaluateWeek, firstWeekKind, nextWeeklyTarget, type WeekKind } from "../src/weekly-goal.js";
import { xpForLevel } from "../src/index.js";
import { applyDailyCap, judgeSession, jumpCappedXp, jumpCheckValue, plausibilityFlag, plausibilityLimits } from "../src/xp-limits.js";
import { SIM_EXERCISES, type SimExercise } from "./exercises.js";
import type { PlannedExercise, Session, SimPlayer } from "./players.js";

// Plays a player's training through the REAL rules in @levelup/shared, week by week.
// Nothing here re-implements a game rule: when a rule or constant changes, rerunning
// the simulation shows its effect. Pure and deterministic (fixed dates, no randomness).

export const SIM_LEVELS = [2, 5, 10, 15, 20] as const;
export type SimLevel = (typeof SIM_LEVELS)[number];

/** When a level was reached: which session (0 = the first) and how many days after sign-up. */
export type LevelReached = { session: number; day: number };

export type SimResult = {
  player: string;
  /** Set XP of each session in the first week, before the daily cap. */
  firstWeekSessionXp: number[];
  /** Biggest single day of set XP, before the daily cap. */
  biggestDayXp: number;
  reached: Record<SimLevel, LevelReached | null>;
  totalXp: number;
  setXp: number;
  bonusXp: number;
  longestStreak: number;
  sessions: number;
  /** Sets the plausibility limits flagged (0 XP). Should be 0 for every honest player. */
  flaggedSets: number;
  /** Sets the jump cap held to the line (above_history). Should be 0 for every honest player. */
  jumpCappedSets: number;
  /** Days the daily cap held XP back, and how much in total. */
  cappedDays: number;
  heldBackXp: number;
  /** Set XP of every training day before the daily cap, with its day (for trying other limits). */
  days: { day: number; xp: number }[];
};

/** Sign-up on a Monday morning (UTC), so the first week is a normal goal week, not a warm-up. */
const SIGN_UP = new Date("2026-01-05T07:00:00Z");
const TIME_ZONE = "UTC";
const DAY_MS = 24 * 60 * 60 * 1000;

const atDay = (day: number, hourUtc: number) => new Date(SIGN_UP.getTime() + day * DAY_MS + (hourUtc - 7) * 60 * 60 * 1000);

/** What a candidate set formula may know about the player's history with this exercise. */
export type SimSetContext = {
  /** The jump-cap baseline before this session, or null the first time. */
  jumpBaseline: number | null;
  /** Every earlier session's best value (estimated 1RM in lifted kg, or seconds), with its day. */
  history: { day: number; value: number }[];
  /** Days since sign-up, today. */
  today: number;
  /** This session's best value for the exercise. */
  sessionBest: number;
  /** The bodyweight the player typed (lifted kg uses it, as PRs do). */
  typedBodyweightKg: number;
};

/**
 * How a set's XP is worked out. Default: the shared setXp. Pluggable only to COMPARE
 * candidate formulas (docs: Milestone 5 balancing); the game always uses the shared one.
 */
export type SimSetXp = (set: { reps: number; weightKg: number }, xpBodyweightKg: number, exercise: SimExercise, context: SimSetContext) => number;

const sharedSetXp: SimSetXp = (set, xpBodyweightKg, exercise) => setXp(set, xpBodyweightKg, exercise);

export function simulate(player: SimPlayer, weeks = 104, options: { setXp?: SimSetXp; xpForLevel?: (level: number) => number } = {}): SimResult {
  const formula = options.setXp ?? sharedSetXp;
  const levelXp = options.xpForLevel ?? xpForLevel;
  const bodyweights: XpBodyweightEntry[] = [];
  const reached = Object.fromEntries(SIM_LEVELS.map((l) => [l, null])) as Record<SimLevel, LevelReached | null>;
  const result = { setXp: 0, bonusXp: 0, biggestDayXp: 0, longestStreak: 0, sessions: 0, flaggedSets: 0, jumpCappedSets: 0, cappedDays: 0, heldBackXp: 0, firstWeekSessionXp: [] as number[], days: [] as { day: number; xp: number }[] };
  /** Each exercise's jump-cap baseline, replayed session by session as the server does. */
  const baselines = new Map<string, number | null>();
  const histories = new Map<string, { day: number; value: number }[]>();

  let kind: WeekKind = firstWeekKind(SIGN_UP, TIME_ZONE);
  let target = 2;
  let streak = 0;

  const checkLevels = (day: number) => {
    for (const level of SIM_LEVELS) {
      if (reached[level] === null && result.setXp + result.bonusXp >= levelXp(level)) reached[level] = { session: result.sessions - 1, day };
    }
  };

  for (let week = 0; week < weeks; week++) {
    const typed = player.typedBodyweight ? player.typedBodyweight(week) : week === 0 ? player.bodyweightKg : null;
    // Typed on Monday morning; the server receives it right away.
    const typedAt = atDay(week * 7, 7);
    if (typed !== null) bodyweights.push({ kg: typed, measuredOn: isoDate(typedAt), receivedAt: typedAt.toISOString() });

    let daysTrained = 0;
    let bonusPaid = false;
    const scheduled = player.strengthAt ? player.strengthAt(week) : undefined;
    for (const weekday of scheduled === null ? [] : player.trainingDays) {
      const day = week * 7 + weekday;
      const startedAt = atDay(day, 18).toISOString();
      const session = player.sessions[result.sessions % player.sessions.length]!;
      const strength = scheduled ?? Math.min(player.growth.max, 1 + player.growth.perWeek * week);

      const bodyweight = { xp: xpBodyweightOnDate(bodyweights, startedAt), typed: bodyweightOnDate(bodyweights, startedAt) };
      const { setXps, flagged, jumpCapped } = scoreSession(session, strength, bodyweight, { baselines, histories, today: day }, formula);
      const dayXp = setXps.reduce((a, b) => a + b, 0);
      result.days.push({ day, xp: dayXp });
      // One session a day, so nothing was awarded earlier that day.
      const capped = applyDailyCap(0, setXps);
      result.flaggedSets += flagged;
      result.jumpCappedSets += jumpCapped;
      result.sessions++;
      result.setXp += dayXp - capped.heldBack;
      result.heldBackXp += capped.heldBack;
      if (capped.heldBack > 0) result.cappedDays++;
      result.biggestDayXp = Math.max(result.biggestDayXp, dayXp);
      if (week === 0) result.firstWeekSessionXp.push(dayXp);

      // The weekly goal pays as soon as it's met (mid-week), as the server does.
      daysTrained++;
      const open = evaluateWeek({ kind, target, daysTrained, streakBefore: streak, closed: false });
      if (open.met && !bonusPaid) {
        bonusPaid = true;
        result.bonusXp += open.bonusXp + open.milestones.reduce((sum, m) => sum + m.xp, 0);
      }
      checkLevels(day);
    }

    const closed = evaluateWeek({ kind, target, daysTrained, streakBefore: streak, closed: true });
    streak = closed.streakAfter;
    result.longestStreak = Math.max(result.longestStreak, streak);
    target = nextWeeklyTarget({ kind, target, daysTrained });
    kind = "goal";
  }

  return { player: player.name, reached, totalXp: result.setXp + result.bonusXp, ...result };
}

/** Set XP of one session on its own (no history), at `strength` x the starting loads. */
export function sessionSetXp(session: Session, strength: number, bodyweightKg: number): number {
  const fresh = { baselines: new Map(), histories: new Map(), today: 0 };
  return scoreSession(session, strength, { xp: bodyweightKg, typed: bodyweightKg }, fresh, sharedSetXp).setXps.reduce((a, b) => a + b, 0);
}

/**
 * Set XP of one session, in the server's order: plausibility flags (0 XP), then the jump
 * cap against each exercise's baseline (which this updates), then the set formula.
 * `bodyweight.xp` is the XP bodyweight (for set XP); `bodyweight.typed` is the real one
 * (for lifted kg, as PRs use).
 */
function scoreSession(
  session: Session,
  strength: number,
  bodyweight: { xp: number; typed: number },
  state: { baselines: Map<string, number | null>; histories: Map<string, { day: number; value: number }[]>; today: number },
  formula: SimSetXp,
): { setXps: number[]; flagged: number; jumpCapped: number } {
  const { baselines, histories, today } = state;
  const setXps: number[] = [];
  let flagged = 0;
  let jumpCapped = 0;
  for (const planned of session) {
    const exercise = SIM_EXERCISES[planned.slug];
    const set = setAtStrength(planned, strength);
    if (plausibilityFlag(set, plausibilityLimits(exercise)) !== null) {
      flagged += planned.sets;
      continue;
    }
    const value = jumpCheckValue({ reps: set.reps, loadKg: liftedKg(set.weightKg, bodyweight.typed, exercise.bodyweightRatio) }, exercise.repsUnit);
    const jumpBaseline = baselines.get(planned.slug) ?? null;
    const judged = judgeSession(jumpBaseline, Array.from({ length: planned.sets }, () => value));
    baselines.set(planned.slug, judged.baselineAfter);
    jumpCapped += judged.aboveHistory.filter(Boolean).length;
    const history = histories.get(planned.slug) ?? [];
    const full = formula(set, bodyweight.xp, exercise, { jumpBaseline, history, today, sessionBest: value, typedBodyweightKg: bodyweight.typed });
    histories.set(planned.slug, [...history, { day: today, value }]);
    for (const factor of judged.factors) setXps.push(jumpCappedXp(full, factor));
  }
  return { setXps, flagged, jumpCapped };
}

function setAtStrength(planned: PlannedExercise, strength: number): { reps: number; weightKg: number } {
  const exercise = SIM_EXERCISES[planned.slug];
  // Bodyweight moves get stronger by doing more reps; loaded ones by adding weight.
  const growsReps = planned.kg === 0 && exercise.bodyweightRatio > 0;
  return {
    reps: growsReps ? Math.round(planned.reps * strength) : planned.reps,
    weightKg: growsReps ? planned.kg : Math.round(planned.kg * strength * 2) / 2,
  };
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
