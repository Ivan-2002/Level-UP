import { countTrainingDays, type WeeklyGoalStatus } from "@levelup/shared";
import { now } from "../../lib/clock.js";
import { prisma, type Db } from "../../lib/prisma.js";
import * as progressionService from "../progression/weekly-goal.service.js";
import * as repo from "./workouts.repository.js";

// The weekly goal needs to know how many days the player trained, and only this module
// reads workouts. So this file hands progression a counting function; progression
// stores the weeks and pays the bonuses.

/** How the workouts module counts a week's training days (rules in @levelup/shared). */
export function daysTrainedFor(db: Db, userId: string): progressionService.DaysTrainedIn {
  return async (weekStart, timeZone) => countTrainingDays(await repo.findWorkoutsAround(db, userId, weekStart), timeZone, weekStart);
}

/** The same count, but only for workouts saved up to `savedAt` (for a workout's summary). */
export function daysTrainedAsOf(userId: string, savedAt: Date): progressionService.DaysTrainedIn {
  return async (weekStart, timeZone) => {
    const workouts = await repo.findWorkoutsAround(prisma, userId, weekStart);
    return countTrainingDays(workouts.filter((w) => w.savedAt <= savedAt), timeZone, weekStart);
  };
}

/** GET /weekly-goal: rolls the player's weeks over (lazily, no cron job) and returns this week. */
export function currentWeeklyGoal(userId: string): Promise<WeeklyGoalStatus> {
  return prisma.$transaction((tx) => progressionService.syncWeeklyGoal(tx, userId, { now: now(), daysTrainedIn: daysTrainedFor(tx, userId) }));
}
