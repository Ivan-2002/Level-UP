import { prisma, type Db } from "../../lib/prisma.js";
import type { BodyPart, XpSource } from "../../generated/prisma/client.js";

// The only file that queries the xp_event ledger.

export type NewXpEvent = { userId: string; amount: number; sourceId: string; bodyPart: BodyPart };

/**
 * One row per completed set. (source, sourceId) is unique, so even if this ran twice for
 * the same set, the database would refuse the second row instead of awarding XP twice.
 */
export async function insertSetXpEvents(db: Db, events: NewXpEvent[]): Promise<void> {
  if (events.length === 0) return;
  await db.xpEvent.createMany({ data: events.map((e) => ({ ...e, source: "workout_set" as const })) });
}

/**
 * One bonus row (weekly goal, streak milestone). ON CONFLICT DO NOTHING on the unique
 * (source, sourceId): paying the same bonus again is a no-op, not an error, so it is safe
 * inside a transaction (a failed INSERT would abort the whole transaction in Postgres).
 * True if it was recorded now.
 */
export async function insertBonusXpEvent(db: Db, event: { userId: string; amount: number; source: XpSource; sourceId: string }): Promise<boolean> {
  const { count } = await db.xpEvent.createMany({ data: [{ ...event, bodyPart: null }], skipDuplicates: true });
  return count === 1;
}

/** Bonus XP recorded for a week, by source. */
export async function sumBonusXp(sourceId: string): Promise<{ weeklyGoal: number; streakMilestone: number }> {
  const rows = await prisma.xpEvent.groupBy({
    by: ["source"],
    where: { sourceId, source: { in: ["weekly_goal", "streak_milestone"] } },
    _sum: { amount: true },
  });
  const of = (source: XpSource) => rows.find((r) => r.source === source)?._sum.amount ?? 0;
  return { weeklyGoal: of("weekly_goal"), streakMilestone: of("streak_milestone") };
}

/** XP awarded for these sets. */
export async function sumSetXp(setIds: string[]): Promise<number> {
  const result = await prisma.xpEvent.aggregate({
    where: { source: "workout_set", sourceId: { in: setIds } },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

/** The player's total XP from everything recorded before `before`. */
export async function sumXpBefore(userId: string, before: Date): Promise<number> {
  const result = await prisma.xpEvent.aggregate({ where: { userId, createdAt: { lt: before } }, _sum: { amount: true } });
  return result._sum.amount ?? 0;
}
