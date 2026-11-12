import { z } from "zod";

// ---------------------------------------------------------------------------
// Weekly goal and streak: the rules, as pure functions. The server's progression
// service stores the results and pays the XP; the app only uses the text helpers.
//
// - Everyone starts at 2 training days a week. Goal met -> next week +1 (max 4);
//   missed -> next week -1 (min 2).
// - A training day = a workout with at least 3 completed sets, counted once per LOCAL
//   calendar day (the player's time zone). Week = Monday to Sunday, local time.
// - The week you sign up in is a warm-up (unless you sign up on a Monday): set XP only,
//   no bonus, no streak, the target doesn't move.
// - Streak = consecutive weeks with the goal met; a missed week resets it to 0.
// ---------------------------------------------------------------------------

export type StreakMilestone = { weeks: number; xp: number };

/** Every tunable number in one place. */
export const WEEKLY_GOAL = {
  startTarget: 2,
  minTarget: 2,
  maxTarget: 4,
  /** A workout needs this many completed (non-flagged) sets to make the day a training day. */
  minSetsPerTrainingDay: 3,
  /** Paid once per week when the goal is met; the same at every target. */
  weeklyBonusXp: 60,
  /** XP is paid every time a milestone is reached (also after a reset); the badge once. */
  streakMilestones: [
    { weeks: 12, xp: 500 },
    { weeks: 26, xp: 1200 },
    { weeks: 52, xp: 3000 },
  ] satisfies StreakMilestone[],
} as const;

/**
 * The ledger sources the future daily XP cap applies to. Weekly and streak bonuses are
 * deliberately NOT in it: hitting your goal on a big day shouldn't cost you the bonus.
 */
export const XP_SOURCES_UNDER_DAILY_CAP = ["workout_set"] as const;

/**
 * goal    = a normal week: counts for the target and the streak.
 * warm_up = the partial week you signed up in: neither moves.
 * A "rest week" pass later is one more kind that behaves like warm_up (pauses both).
 */
export const WEEK_KINDS = ["goal", "warm_up"] as const;
export type WeekKind = (typeof WEEK_KINDS)[number];

const pausesGoal = (kind: WeekKind) => kind !== "goal";

// --- Calendar dates in the player's time zone ------------------------------------------
// Dates are "YYYY-MM-DD" strings: a calendar day has no time zone once worked out, and
// adding days to a date (not to an instant) can't be thrown off by daylight saving.

export type LocalDate = string;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** An IANA time zone such as "Africa/Johannesburg" (what the phone reports). */
export const timeZoneSchema = z.string().min(1).max(64).refine(isValidTimeZone, "Unknown time zone.");

/** The calendar day an instant falls on in `timeZone`. */
export function localDate(instant: Date | string, timeZone: string): LocalDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    typeof instant === "string" ? new Date(instant) : instant,
  );
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 1 = Monday ... 7 = Sunday (ISO). */
function isoWeekday(date: LocalDate): number {
  return ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** The Monday of the week a date is in. */
export function weekStartOf(date: LocalDate): LocalDate {
  return addDays(date, 1 - isoWeekday(date));
}

/** The kind of the week someone signed up in: a full week only if they started on its Monday. */
export function firstWeekKind(signedUpAt: Date | string, timeZone: string): WeekKind {
  return isoWeekday(localDate(signedUpAt, timeZone)) === 1 ? "goal" : "warm_up";
}

// --- Training days ------------------------------------------------------------------------

export type WorkoutForGoal = { startedAt: Date | string; completedSets: number };

/**
 * Distinct local days with at least one qualifying workout. A workout belongs to the
 * day it STARTED: a session from 23:30 to 00:40 is the evening's workout.
 * Pass `weekStart` to count only that week's days.
 */
export function countTrainingDays(workouts: WorkoutForGoal[], timeZone: string, weekStart?: LocalDate): number {
  const days = new Set<LocalDate>();
  for (const w of workouts) {
    if (w.completedSets < WEEKLY_GOAL.minSetsPerTrainingDay) continue;
    const day = localDate(w.startedAt, timeZone);
    if (weekStart === undefined || weekStartOf(day) === weekStart) days.add(day);
  }
  return days.size;
}

// --- Target, streak, milestones -----------------------------------------------------------

export function nextWeeklyTarget(week: { kind: WeekKind; target: number; met: boolean }): number {
  if (pausesGoal(week.kind)) return week.target;
  const next = week.met ? week.target + 1 : week.target - 1;
  return Math.min(WEEKLY_GOAL.maxTarget, Math.max(WEEKLY_GOAL.minTarget, next));
}

/** The streak after a finished goal week. */
export function nextStreak(prevStreak: number, met: boolean): number {
  return met ? prevStreak + 1 : 0;
}

/** Milestones crossed going from one streak to the next (several only if it jumps). */
export function milestonesReached(prevStreak: number, newStreak: number): StreakMilestone[] {
  return WEEKLY_GOAL.streakMilestones.filter((m) => prevStreak < m.weeks && m.weeks <= newStreak);
}

export type WeekEvaluation = {
  met: boolean;
  /** The streak including this week. While the week is open and not yet met, the
   * streak is still alive, so it stays at the previous value. */
  streakAfter: number;
  bonusXp: number;
  milestones: StreakMilestone[];
};

/**
 * What a week is worth. `closed` = the week is over (only then can it be "missed").
 * Meeting the goal pays at once, mid-week; the week can't become un-met later, because
 * training days are only ever added.
 */
export function evaluateWeek(week: {
  kind: WeekKind;
  target: number;
  daysTrained: number;
  streakBefore: number;
  closed: boolean;
}): WeekEvaluation {
  if (pausesGoal(week.kind)) return { met: false, streakAfter: week.streakBefore, bonusXp: 0, milestones: [] };
  const met = week.daysTrained >= week.target;
  if (!met) return { met, streakAfter: week.closed ? 0 : week.streakBefore, bonusXp: 0, milestones: [] };
  const streakAfter = nextStreak(week.streakBefore, true);
  return { met, streakAfter, bonusXp: WEEKLY_GOAL.weeklyBonusXp, milestones: milestonesReached(week.streakBefore, streakAfter) };
}

// --- The contract and the text the app shows ---------------------------------------------

export const weeklyGoalStatusSchema = z.object({
  weekStart: z.iso.date(),
  kind: z.enum(WEEK_KINDS),
  target: z.number().int(),
  daysTrained: z.number().int(),
  met: z.boolean(),
  /** Consecutive goal weeks met, including this one once it's met. */
  streak: z.number().int(),
});
/** Response of GET /weekly-goal, and part of the workout summary. */
export type WeeklyGoalStatus = z.infer<typeof weeklyGoalStatusSchema>;

/** "2 of 3 days this week". */
export function goalProgressText(status: Pick<WeeklyGoalStatus, "kind" | "target" | "daysTrained">): string {
  if (status.kind === "warm_up") {
    return `Warm-up week · ${status.daysTrained} ${status.daysTrained === 1 ? "day" : "days"} so far`;
  }
  return `${status.daysTrained} of ${status.target} days this week`;
}

/**
 * "Week 7 · 5 to go for 12 weeks". The week number is the streak you're building:
 * the week in progress counts as week streak + 1 until it's met.
 */
export function streakText(status: Pick<WeeklyGoalStatus, "kind" | "met" | "streak">): string {
  if (status.kind === "warm_up") return "Your first goal week starts on Monday";
  const week = status.met ? status.streak : status.streak + 1;
  // The next milestone not yet reached (a met week has already reached its own).
  const next = WEEKLY_GOAL.streakMilestones.find((m) => m.weeks > status.streak);
  if (!next) return `Week ${week}`;
  const toGo = next.weeks - week;
  return toGo === 0 ? `Week ${week} · hit your goal for ${next.weeks} weeks` : `Week ${week} · ${toGo} to go for ${next.weeks} weeks`;
}
