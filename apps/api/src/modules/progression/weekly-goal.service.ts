import {
  addDays,
  evaluateWeek,
  firstWeekKind,
  localDate,
  nextWeeklyTarget,
  weekStartOf,
  WEEKLY_GOAL,
  type LocalDate,
  type WeekEvaluation,
  type WeeklyGoalStatus,
} from "@levelup/shared";
import { now } from "../../lib/clock.js";
import type { Db } from "../../lib/prisma.js";
import * as usersService from "../users/users.service.js";
import * as xpRepo from "./progression.repository.js";
import * as repo from "./weekly-goal.repository.js";

// The weekly goal and streak: storing weeks and paying their bonuses. The RULES are pure
// functions in @levelup/shared (weekly-goal.ts); this file applies them week by week.
//
// No scheduled job. Weeks are "rolled over" lazily whenever the player opens the app or
// finishes a workout: every week that ended since the last visit is closed in order, so
// a player back after 3 weeks away gets 3 missed weeks (target stepping down, streak
// reset) before the current one is opened.
//
// Bonuses go through the XP ledger with sourceId = the week's id, which is unique per
// (source, sourceId): replaying a rollover, or a repeated Finish, can never pay twice.

/**
 * Counts a week's training days. Supplied by the caller (the workouts module) so that
 * progression never reads workouts itself: dependencies only point workouts -> progression.
 */
export type DaysTrainedIn = (weekStart: LocalDate, timeZone: string) => Promise<number>;

/**
 * Brings the player's weeks up to date and returns this week's status. Runs inside the
 * caller's transaction; the player's profile row stays locked until it commits.
 * `metByWorkoutId`: the workout being finished, credited if it meets a week's goal.
 */
export async function syncWeeklyGoal(
  db: Db,
  userId: string,
  options: { now: Date; daysTrainedIn: DaysTrainedIn; metByWorkoutId?: string },
): Promise<WeeklyGoalStatus> {
  const { timeZone, createdAt } = await usersService.lockGoalContext(db, userId);
  const currentWeek = weekStartOf(localDate(options.now, timeZone));

  let week = await repo.findLatestWeek(db, userId);
  if (!week) {
    // First visit: the week they signed up in. Usually a warm-up (see firstWeekKind).
    week = await repo.createWeek(db, {
      userId,
      weekStart: weekStartOf(localDate(createdAt, timeZone)),
      kind: firstWeekKind(createdAt, timeZone),
      target: WEEKLY_GOAL.startTarget,
      streakAfter: 0,
    });
  }
  let streakBefore = (await repo.findWeek(userId, addDays(week.weekStart, -7), db))?.streakAfter ?? 0;

  // Close every week that has ended, oldest first, opening the next one each time.
  while (week.weekStart < currentWeek) {
    // A week already closed keeps its result: closing is final.
    const closed = week.closedAt ? week : await settleWeek(db, userId, week, streakBefore, timeZone, options, true);
    week = await repo.createWeek(db, {
      userId,
      weekStart: addDays(week.weekStart, 7),
      kind: "goal",
      target: nextWeeklyTarget({ kind: week.kind, target: week.target, met: closed.met }),
      streakAfter: closed.streakAfter, // carried until this week is met or missed
    });
    streakBefore = closed.streakAfter;
  }

  // The current week: refresh its count; meeting the goal pays now, not on Sunday.
  const open = await settleWeek(db, userId, week, streakBefore, timeZone, options, false);
  return toStatus(week, open);
}

/** Recounts a week, stores its result and pays what it earned. */
async function settleWeek(
  db: Db,
  userId: string,
  week: repo.WeekRow,
  streakBefore: number,
  timeZone: string,
  options: { daysTrainedIn: DaysTrainedIn; metByWorkoutId?: string },
  closed: boolean,
): Promise<WeekEvaluation & { daysTrained: number }> {
  // Days only ever go up: a recount that comes out lower (e.g. the time zone changed and a
  // workout moved across midnight) must not un-meet a week whose bonus is already paid.
  const daysTrained = Math.max(week.daysTrained, await options.daysTrainedIn(week.weekStart, timeZone));
  const evaluation = evaluateWeek({ kind: week.kind, target: week.target, daysTrained, streakBefore, closed });
  const newlyMet = evaluation.met && !week.met;

  await repo.updateWeek(db, week.id, {
    daysTrained,
    met: evaluation.met,
    streakAfter: evaluation.streakAfter,
    metByWorkoutId: week.metByWorkoutId ?? (newlyMet ? (options.metByWorkoutId ?? null) : null),
    ...(closed ? { closedAt: now() } : {}),
  });

  if (evaluation.met) {
    // Idempotent: on a later visit these find their rows already there and do nothing.
    await payBonus(db, userId, "weekly_goal", week.id, evaluation.bonusXp);
    for (const milestone of evaluation.milestones) {
      await payBonus(db, userId, "streak_milestone", week.id, milestone.xp);
      await repo.insertAchievement(db, userId, `streak_${milestone.weeks}`, week.id); // badge: once ever
    }
  }
  return { ...evaluation, daysTrained };
}

async function payBonus(db: Db, userId: string, source: "weekly_goal" | "streak_milestone", weekId: string, amount: number) {
  if (amount <= 0) return;
  const paidNow = await xpRepo.insertBonusXpEvent(db, { userId, amount, source, sourceId: weekId });
  if (paidNow) await usersService.addTotalXp(db, userId, amount);
}

function toStatus(week: repo.WeekRow, result: { met: boolean; streakAfter: number; daysTrained: number }): WeeklyGoalStatus {
  return {
    weekStart: week.weekStart,
    kind: week.kind,
    target: week.target,
    daysTrained: result.daysTrained,
    met: result.met,
    streak: result.streakAfter,
  };
}

// --- For the workout summary -------------------------------------------------------------

/** The bonus XP a workout earned by meeting its week's goal (0 and 0 if it didn't). */
export async function bonusXpOf(workoutId: string): Promise<{ weeklyGoal: number; streakMilestone: number }> {
  const week = await repo.findWeekMetBy(workoutId);
  return week ? xpRepo.sumBonusXp(week.id) : { weeklyGoal: 0, streakMilestone: 0 };
}

/**
 * The goal of the week a workout started in, AS OF that workout: `daysTrainedAsOf` counts
 * only workouts saved up to it. So the summary shows the progress this workout made
 * ("2 of 3 days"), and a repeated Finish returns exactly the same numbers even after
 * later workouts. Null if that week has no goal row.
 */
export async function weekStatusAsOf(userId: string, startedAt: Date, daysTrainedAsOf: DaysTrainedIn): Promise<WeeklyGoalStatus | null> {
  const timeZone = await usersService.timeZoneOf(userId);
  const week = await repo.findWeek(userId, weekStartOf(localDate(startedAt, timeZone)));
  if (!week) return null;
  const streakBefore = (await repo.findWeek(userId, addDays(week.weekStart, -7)))?.streakAfter ?? 0;
  const daysTrained = await daysTrainedAsOf(week.weekStart, timeZone);
  return toStatus(week, { ...evaluateWeek({ kind: week.kind, target: week.target, daysTrained, streakBefore, closed: false }), daysTrained });
}

/** Badges earned so far, e.g. ["streak_12"]. */
export function achievements(userId: string): Promise<string[]> {
  return repo.findAchievementKeys(userId);
}
