import { prisma, type Db } from "../../lib/prisma.js";
import type { BodyPart, XpSource } from "../../generated/prisma/client.js";

// The only file that queries the xp_event ledger.

/** `earnedOn`: the player's local calendar day ("YYYY-MM-DD") the XP belongs to. */
export type NewXpEvent = { userId: string; amount: number; sourceId: string; bodyPart: BodyPart; earnedOn: string };

const toDate = (day: string) => new Date(`${day}T00:00:00Z`); // a Postgres DATE

/**
 * One row per completed set. (source, sourceId) is unique, so even if this ran twice for
 * the same set, the database would refuse the second row instead of awarding XP twice.
 */
export async function insertSetXpEvents(db: Db, events: NewXpEvent[]): Promise<void> {
  if (events.length === 0) return;
  await db.xpEvent.createMany({ data: events.map((e) => ({ ...e, earnedOn: toDate(e.earnedOn), source: "workout_set" as const })) });
}

/**
 * One row with no body part (weekly goal, streak milestone, dev grant). ON CONFLICT DO NOTHING on the unique
 * (source, sourceId): paying the same bonus again is a no-op, not an error, so it is safe
 * inside a transaction (a failed INSERT would abort the whole transaction in Postgres).
 * True if it was recorded now.
 */
export async function insertBonusXpEvent(
  db: Db,
  event: { userId: string; amount: number; source: XpSource; sourceId: string; earnedOn: string },
): Promise<boolean> {
  const { count } = await db.xpEvent.createMany({ data: [{ ...event, earnedOn: toDate(event.earnedOn), bodyPart: null }], skipDuplicates: true });
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

/**
 * XP already recorded on one local day (`earnedOn`, "YYYY-MM-DD") from these sources: what
 * the daily cap has used up. Uses the (userId, earnedOn) index.
 */
export async function sumXpOnDay(db: Db, userId: string, earnedOn: string, sources: readonly XpSource[]): Promise<number> {
  const result = await db.xpEvent.aggregate({
    where: { userId, earnedOn: toDate(earnedOn), source: { in: [...sources] } },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

/** XP awarded for each of these sets (a set with no row earned nothing). */
export async function setXpBySet(setIds: string[]): Promise<Map<string, number>> {
  const rows = await prisma.xpEvent.findMany({
    where: { source: "workout_set", sourceId: { in: setIds } },
    select: { sourceId: true, amount: true },
  });
  return new Map(rows.map((r) => [r.sourceId, r.amount]));
}

/** The player's total XP from everything recorded before `before`. */
export async function sumXpBefore(userId: string, before: Date): Promise<number> {
  const result = await prisma.xpEvent.aggregate({ where: { userId, createdAt: { lt: before } }, _sum: { amount: true } });
  return result._sum.amount ?? 0;
}
