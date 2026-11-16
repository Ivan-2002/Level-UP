import { setXp, xpBodyweightOnDate, type XpBodyweightEntry } from "../src/progression.js";
import { evaluateWeek, firstWeekKind, nextWeeklyTarget, type WeekKind } from "../src/weekly-goal.js";
import { xpForLevel } from "../src/index.js";
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
  /** Set XP of each session in the first week, before any cap. */
  firstWeekSessionXp: number[];
  /** Biggest single day of set XP, before any cap. */
  biggestDayXp: number;
  reached: Record<SimLevel, LevelReached | null>;
  totalXp: number;
  setXp: number;
  bonusXp: number;
  longestStreak: number;
  sessions: number;
};

/** Sign-up on a Monday morning (UTC), so the first week is a normal goal week, not a warm-up. */
const SIGN_UP = new Date("2026-01-05T07:00:00Z");
const TIME_ZONE = "UTC";
const DAY_MS = 24 * 60 * 60 * 1000;

const atDay = (day: number, hourUtc: number) => new Date(SIGN_UP.getTime() + day * DAY_MS + (hourUtc - 7) * 60 * 60 * 1000);

export function simulate(player: SimPlayer, weeks = 104): SimResult {
  const bodyweights: XpBodyweightEntry[] = [];
  const reached = Object.fromEntries(SIM_LEVELS.map((l) => [l, null])) as Record<SimLevel, LevelReached | null>;
  const result = { setXp: 0, bonusXp: 0, biggestDayXp: 0, longestStreak: 0, sessions: 0, firstWeekSessionXp: [] as number[] };

  let kind: WeekKind = firstWeekKind(SIGN_UP, TIME_ZONE);
  let target = 2;
  let streak = 0;

  const checkLevels = (day: number) => {
    for (const level of SIM_LEVELS) {
      if (reached[level] === null && result.setXp + result.bonusXp >= xpForLevel(level)) reached[level] = { session: result.sessions - 1, day };
    }
  };

  for (let week = 0; week < weeks; week++) {
    const typed = player.typedBodyweight ? player.typedBodyweight(week) : week === 0 ? player.bodyweightKg : null;
    // Typed on Monday morning; the server receives it right away.
    const typedAt = atDay(week * 7, 7);
    if (typed !== null) bodyweights.push({ kg: typed, measuredOn: isoDate(typedAt), receivedAt: typedAt.toISOString() });

    let daysTrained = 0;
    let bonusPaid = false;
    for (const weekday of player.trainingDays) {
      const day = week * 7 + weekday;
      const startedAt = atDay(day, 18).toISOString();
      const session = player.sessions[result.sessions % player.sessions.length]!;
      const strength = Math.min(player.growth.max, 1 + player.growth.perWeek * week);

      const dayXp = sessionSetXp(session, strength, xpBodyweightOnDate(bodyweights, startedAt));
      result.sessions++;
      result.setXp += dayXp;
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
    target = nextWeeklyTarget({ kind, target, met: closed.met });
    kind = "goal";
  }

  return { player: player.name, reached, totalXp: result.setXp + result.bonusXp, ...result };
}

/** Set XP of one session, at `strength` x the starting loads (reps, for bodyweight moves). */
export function sessionSetXp(session: Session, strength: number, bodyweightKg: number): number {
  return session.reduce((sum, planned) => sum + planned.sets * oneSetXp(planned, strength, bodyweightKg), 0);
}

function oneSetXp(planned: PlannedExercise, strength: number, bodyweightKg: number): number {
  const exercise = SIM_EXERCISES[planned.slug];
  // Bodyweight moves get stronger by doing more reps; loaded ones by adding weight.
  const growsReps = planned.kg === 0 && exercise.bodyweightRatio > 0;
  const reps = growsReps ? Math.round(planned.reps * strength) : planned.reps;
  const weightKg = growsReps ? planned.kg : Math.round(planned.kg * strength * 2) / 2;
  return setXp({ reps, weightKg }, bodyweightKg, exercise);
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
