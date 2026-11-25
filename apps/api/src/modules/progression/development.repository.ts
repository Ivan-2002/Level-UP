import type { BodyPart } from "@levelup/shared";
import { prisma } from "../../lib/prisma.js";

// The ledger reads body-part development is walked from: each body part's summed stimulus
// per local day (xp_event.stimulus by earned_on). Rows without a body part (weekly and streak
// bonuses, a plain dev grant) grow nothing and are left out.

export type StimulusRow = { bodyPart: BodyPart; day: string; stimulus: number };

const toDate = (day: string) => new Date(`${day}T00:00:00Z`); // a Postgres DATE
const toDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Summed stimulus per body part and local day, up to and including `until`.
 * `recordedBefore`: only rows the server recorded before this moment (ledger order), so a
 * workout's "before" never includes rows that arrived later. Uses the (userId, earnedOn) index.
 */
export async function stimulusByPartAndDay(
  userId: string,
  until: string,
  recordedBefore?: Date,
): Promise<StimulusRow[]> {
  const groups = await prisma.xpEvent.groupBy({
    by: ["bodyPart", "earnedOn"],
    where: {
      userId,
      bodyPart: { not: null },
      earnedOn: { lte: toDate(until) },
      ...(recordedBefore ? { createdAt: { lt: recordedBefore } } : {}),
    },
    _sum: { stimulus: true },
  });
  return groups.map((g) => ({ bodyPart: g.bodyPart!, day: toDay(g.earnedOn), stimulus: Number(g._sum.stimulus ?? 0) }));
}

/** The stimulus rows of these sets (one workout's own rows), with their local day. */
export async function stimulusOfSets(setIds: string[]): Promise<StimulusRow[]> {
  if (setIds.length === 0) return [];
  const rows = await prisma.xpEvent.findMany({
    where: { source: "workout_set", sourceId: { in: setIds }, bodyPart: { not: null } },
    select: { bodyPart: true, earnedOn: true, stimulus: true },
  });
  return rows.map((r) => ({ bodyPart: r.bodyPart!, day: toDay(r.earnedOn), stimulus: Number(r.stimulus) }));
}
