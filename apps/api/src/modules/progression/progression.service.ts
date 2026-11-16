import type { BodyPart } from "@levelup/shared";
import type { Db } from "../../lib/prisma.js";
import * as usersService from "../users/users.service.js";
import * as repo from "./progression.repository.js";

// The XP ledger: the only place XP is ever recorded. The RULES (how much a set is worth)
// are pure functions in @levelup/shared; this module stores the result.
// Dependencies: progression -> users (cached total). Nothing here reads workouts.

export type SetXpAward = { setId: string; amount: number; bodyPart: BodyPart };

/**
 * Records XP for completed sets and adds it to the cached total, inside the caller's
 * transaction (Finish). Zero-XP sets get no ledger row.
 */
export async function awardSetXp(db: Db, userId: string, awards: SetXpAward[]): Promise<number> {
  const earning = awards.filter((a) => a.amount > 0);
  await repo.insertSetXpEvents(
    db,
    earning.map((a) => ({ userId, amount: a.amount, sourceId: a.setId, bodyPart: a.bodyPart })),
  );
  const earned = earning.reduce((sum, a) => sum + a.amount, 0);
  if (earned > 0) await usersService.addTotalXp(db, userId, earned);
  return earned;
}

/**
 * What one workout earned, and the player's total just before it: the XP recorded
 * before the workout was saved. Recomputed on every read, so a repeated Finish shows
 * the same numbers.
 */
export async function workoutXp(userId: string, setIds: string[], savedAt: Date): Promise<{ earned: number; totalBefore: number }> {
  const [earned, totalBefore] = await Promise.all([repo.sumSetXp(setIds), repo.sumXpBefore(userId, savedAt)]);
  return { earned, totalBefore };
}
