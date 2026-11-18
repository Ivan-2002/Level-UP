import { bodyweightOnDate, xpBodyweightOnDate, type BodyweightReceipt } from "../src/progression.js";
import { recentBest, scoreSessionSets, type ExerciseXpHistory, type SessionSet } from "../src/set-scoring.js";
import { evaluateWeek, firstWeekKind, nextWeeklyTarget, type WeekKind } from "../src/weekly-goal.js";
import { xpForLevel } from "../src/index.js";
import { applyDailyCap, type DailyCapResult } from "../src/xp-limits.js";
import { SIM_EXERCISES } from "./exercises.js";
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
  /** Sets beyond 10 of one exercise in a session (0 XP). Should be 0 for every honest player. */
  beyondLimitSets: number;
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

/** Everything a simulation carries from one session and week to the next. */
type SimState = {
  player: SimPlayer;
  capDay: (setXp: number[]) => DailyCapResult;
  levelXp: (level: number) => number;
  bodyweights: BodyweightReceipt[];
  reached: Record<SimLevel, LevelReached | null>;
  totals: Omit<SimResult, "player" | "reached" | "totalXp">;
  /** Each exercise's jump-cap baseline and its sessions' best values, as the server replays them. */
  baselines: Map<string, number | null>;
  histories: Map<string, { date: string; value: number }[]>;
  /** The week being played: its kind and target, and the streak before it. */
  week: { kind: WeekKind; target: number; streak: number };
};

export function simulate(
  player: SimPlayer,
  weeks = 104,
  options: { xpForLevel?: (level: number) => number; dailyCap?: (setXp: number[]) => DailyCapResult } = {},
): SimResult {
  const state: SimState = {
    player,
    capDay: options.dailyCap ?? ((setXp: number[]) => applyDailyCap(0, setXp)),
    levelXp: options.xpForLevel ?? xpForLevel,
    bodyweights: [],
    reached: Object.fromEntries(SIM_LEVELS.map((l) => [l, null])) as Record<SimLevel, LevelReached | null>,
    totals: { setXp: 0, bonusXp: 0, biggestDayXp: 0, longestStreak: 0, sessions: 0, flaggedSets: 0, jumpCappedSets: 0, beyondLimitSets: 0, cappedDays: 0, heldBackXp: 0, firstWeekSessionXp: [], days: [] },
    baselines: new Map(),
    histories: new Map(),
    week: { kind: firstWeekKind(SIGN_UP, TIME_ZONE), target: 2, streak: 0 },
  };

  for (let week = 0; week < weeks; week++) playWeek(state, week);

  const result = state.totals;
  return { player: player.name, reached: state.reached, totalXp: result.setXp + result.bonusXp, ...result };
}

/** The bodyweight the player types on a week's Monday, or null if they don't. */
function typedBodyweight(player: SimPlayer, week: number): number | null {
  if (player.typedBodyweight) return player.typedBodyweight(week);
  return week === 0 ? player.bodyweightKg : null;
}

/** One week: the bodyweight entry, each training day's session, then closing the week. */
function playWeek(state: SimState, week: number): void {
  const { player } = state;
  const typed = typedBodyweight(player, week);
  // Typed on Monday morning; the server receives it right away.
  const typedAt = atDay(week * 7, 7);
  if (typed !== null) state.bodyweights.push({ kg: typed, measuredOn: isoDate(typedAt), receivedAt: typedAt.toISOString() });

  let daysTrained = 0;
  let bonusPaid = false;
  const scheduled = player.strengthAt ? player.strengthAt(week) : undefined;
  for (const weekday of scheduled === null ? [] : player.trainingDays) {
    const day = week * 7 + weekday;
    const strength = scheduled ?? Math.min(player.growth.max, 1 + player.growth.perWeek * week);
    playSession(state, week, day, strength);

    daysTrained++;
    bonusPaid = payGoalIfMet(state, daysTrained, bonusPaid);
    checkLevels(state, day);
  }

  closeWeek(state, daysTrained);
}

/** One training day's session: scored, capped and added to the totals. */
function playSession(state: SimState, week: number, day: number, strength: number): void {
  const { player, totals } = state;
  const startedAt = atDay(day, 18).toISOString();
  const session = player.sessions[totals.sessions % player.sessions.length]!;

  const bodyweight = { xp: xpBodyweightOnDate(state.bodyweights, startedAt), typed: bodyweightOnDate(state.bodyweights, startedAt) };
  const { setXps, flagged, jumpCapped, beyondLimit } = scoreSession(session, strength, bodyweight, { baselines: state.baselines, histories: state.histories, today: startedAt });
  const dayXp = setXps.reduce((a, b) => a + b, 0);
  totals.days.push({ day, xp: dayXp });
  // One session a day, so nothing was awarded earlier that day.
  const capped = state.capDay(setXps);
  totals.flaggedSets += flagged;
  totals.jumpCappedSets += jumpCapped;
  totals.beyondLimitSets += beyondLimit;
  totals.sessions++;
  totals.setXp += dayXp - capped.heldBack;
  totals.heldBackXp += capped.heldBack;
  if (capped.heldBack > 0) totals.cappedDays++;
  totals.biggestDayXp = Math.max(totals.biggestDayXp, dayXp);
  if (week === 0) totals.firstWeekSessionXp.push(dayXp);
}

/** The weekly goal pays as soon as it's met (mid-week), as the server does. Returns whether it has been paid. */
function payGoalIfMet(state: SimState, daysTrained: number, bonusPaid: boolean): boolean {
  const { kind, target, streak } = state.week;
  const open = evaluateWeek({ kind, target, daysTrained, streakBefore: streak, closed: false });
  if (!open.met || bonusPaid) return bonusPaid;
  state.totals.bonusXp += open.bonusXp + open.milestones.reduce((sum, m) => sum + m.xp, 0);
  return true;
}

function checkLevels(state: SimState, day: number): void {
  const { totals, reached } = state;
  for (const level of SIM_LEVELS) {
    if (reached[level] === null && totals.setXp + totals.bonusXp >= state.levelXp(level)) reached[level] = { session: totals.sessions - 1, day };
  }
}

/** Ends the week: the streak, and next week's target (every week after the first is a goal week). */
function closeWeek(state: SimState, daysTrained: number): void {
  const { kind, target, streak } = state.week;
  const closed = evaluateWeek({ kind, target, daysTrained, streakBefore: streak, closed: true });
  state.totals.longestStreak = Math.max(state.totals.longestStreak, closed.streakAfter);
  state.week = { kind: "goal", target: nextWeeklyTarget({ kind, target, daysTrained }), streak: closed.streakAfter };
}

/** Set XP of one session on its own (no history), at `strength` x the starting loads. */
export function sessionSetXp(session: Session, strength: number, bodyweightKg: number): number {
  const fresh = { baselines: new Map(), histories: new Map(), today: SIGN_UP.toISOString() };
  return scoreSession(session, strength, { xp: bodyweightKg, typed: bodyweightKg }, fresh).setXps.reduce((a, b) => a + b, 0);
}

/**
 * One session through the shared pipeline (scoreSessionSets: plausibility, jump cap,
 * effort, warm-ups, the 10-set limit, set XP), with the exercise history the server would
 * load. Updates that history for the next session.
 */
function scoreSession(
  session: Session,
  strength: number,
  bodyweight: { xp: number; typed: number },
  state: { baselines: Map<string, number | null>; histories: Map<string, { date: string; value: number }[]>; today: string },
): { setXps: number[]; flagged: number; jumpCapped: number; beyondLimit: number } {
  const sets: SessionSet[] = session.flatMap((planned) => {
    const set = setAtStrength(planned, strength);
    return Array.from({ length: planned.sets }, () => ({ exerciseId: planned.slug, ...set }));
  });
  const history = new Map<string, ExerciseXpHistory>(
    session.map((p) => [p.slug, { recentBest: recentBest(state.histories.get(p.slug) ?? [], state.today), jumpBaseline: state.baselines.get(p.slug) ?? null }]),
  );
  const exercises = new Map(session.map((p) => [p.slug, SIM_EXERCISES[p.slug]]));
  const score = scoreSessionSets({ sets, exercises, history, bodyweight });

  for (const [slug, after] of score.exercises) {
    state.baselines.set(slug, after.jumpBaselineAfter);
    if (after.sessionBest !== null) state.histories.set(slug, [...(state.histories.get(slug) ?? []), { date: state.today, value: after.sessionBest }]);
  }
  return {
    setXps: score.sets.map((s) => s.xp),
    flagged: score.sets.filter((s) => s.isFlagged).length,
    jumpCapped: score.sets.filter((s) => s.flagReason === "above_history").length,
    beyondLimit: score.sets.filter((s) => s.tag === "beyond_set_limit").length,
  };
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
