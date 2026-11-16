import { prisma, type Db } from "../../lib/prisma.js";
import type { WeekKind, WeeklyGoal } from "../../generated/prisma/client.js";

// The only file that queries weekly_goal and user_achievement.
// Weeks are calendar dates ("YYYY-MM-DD"); Postgres DATE columns come back as a Date at
// UTC midnight, so we convert at this boundary and the rest of the code sees strings.

export type WeekRow = Omit<WeeklyGoal, "weekStart"> & { weekStart: string };

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toRow = (row: WeeklyGoal): WeekRow => ({ ...row, weekStart: row.weekStart.toISOString().slice(0, 10) });

export async function findLatestWeek(db: Db, userId: string): Promise<WeekRow | null> {
  const row = await db.weeklyGoal.findFirst({ where: { userId }, orderBy: { weekStart: "desc" } });
  return row ? toRow(row) : null;
}

export async function findWeek(userId: string, weekStart: string, db: Db = prisma): Promise<WeekRow | null> {
  const row = await db.weeklyGoal.findUnique({ where: { userId_weekStart: { userId, weekStart: toDate(weekStart) } } });
  return row ? toRow(row) : null;
}

export async function findWeekMetBy(workoutId: string): Promise<WeekRow | null> {
  const row = await prisma.weeklyGoal.findFirst({ where: { metByWorkoutId: workoutId } });
  return row ? toRow(row) : null;
}

export async function createWeek(
  db: Db,
  data: { userId: string; weekStart: string; kind: WeekKind; target: number; streakAfter: number },
): Promise<WeekRow> {
  return toRow(await db.weeklyGoal.create({ data: { ...data, weekStart: toDate(data.weekStart) } }));
}

export async function updateWeek(
  db: Db,
  id: string,
  data: { daysTrained: number; met: boolean; streakAfter: number; metByWorkoutId: string | null; closedAt?: Date },
): Promise<WeekRow> {
  return toRow(await db.weeklyGoal.update({ where: { id }, data }));
}

/** Awards a badge unless the player already has it. True if it was new. */
export async function insertAchievement(db: Db, userId: string, key: string, sourceId: string): Promise<boolean> {
  const { count } = await db.userAchievement.createMany({ data: [{ userId, key, sourceId }], skipDuplicates: true });
  return count === 1;
}

export async function findAchievementKeys(userId: string): Promise<string[]> {
  const rows = await prisma.userAchievement.findMany({ where: { userId }, select: { key: true } });
  return rows.map((r) => r.key);
}
