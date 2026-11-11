import { prisma, type Db } from "../../lib/prisma.js";
import type { BodyPart } from "../../generated/prisma/client.js";

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
