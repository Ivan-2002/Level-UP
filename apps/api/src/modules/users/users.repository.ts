import { prisma, type Db } from "../../lib/prisma.js";
import { Prisma, type Profile as ProfileRow } from "../../generated/prisma/client.js";

// The repository is the ONLY file in this module that talks to Prisma.
// It knows how data is stored (tables, Decimal columns, Prisma error codes) and
// nothing about business rules. Swapping Prisma for raw SQL would only touch this file.

export type { ProfileRow };

/** A profile plus the player's most recent bodyweight (stored as a dated history). */
export type ProfileRecord = ProfileRow & { bodyweightKg: Prisma.Decimal | null };

export type NewProfile = {
  userId: string;
  username: string;
  bodyweightKg?: number;
  weeklyTarget: number;
};

export async function findProfileByUserId(userId: string): Promise<ProfileRecord | null> {
  const row = await prisma.profile.findUnique({ where: { userId } });
  return row ? withLatestBodyweight(row) : null;
}

export async function profileExists(userId: string): Promise<boolean> {
  return (await prisma.profile.count({ where: { userId } })) > 0;
}

/** Case-insensitive, because the column is citext (see schema.prisma). */
export function findProfileByUsername(username: string): Promise<ProfileRow | null> {
  return prisma.profile.findUnique({ where: { username } });
}

/**
 * Inserts a profile, plus its first bodyweight entry when one was given, in ONE
 * transaction: either both are saved or neither is.
 * Returns "duplicate" instead of throwing when a unique constraint fails (this user
 * already has a profile, or the username is taken), because two requests can race past
 * the service's checks; the database is the final judge.
 */
export async function insertProfile(data: NewProfile): Promise<ProfileRecord | "duplicate"> {
  const { bodyweightKg, ...profile } = data;
  try {
    const [row] = await prisma.$transaction([
      prisma.profile.create({ data: profile }),
      ...(bodyweightKg === undefined
        ? []
        : [prisma.bodyweightEntry.create({ data: { userId: data.userId, kg: bodyweightKg, measuredOn: todayUtc() } })]),
    ]);
    return withLatestBodyweight(row);
  } catch (err) {
    // P2002 = Prisma's code for "unique constraint failed".
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return "duplicate";
    }
    throw err;
  }
}

/** One entry per day: recording today's weight again replaces it. */
export function upsertBodyweight(userId: string, kg: number, measuredOn: Date) {
  return prisma.bodyweightEntry.upsert({
    where: { userId_measuredOn: { userId, measuredOn } },
    create: { userId, kg, measuredOn },
    update: { kg },
  });
}

export function findBodyweightEntries(userId: string, db: Db = prisma) {
  return db.bodyweightEntry.findMany({ where: { userId }, orderBy: { measuredOn: "asc" }, select: { kg: true, measuredOn: true } });
}

/** Keeps the cached total in step with the XP ledger (called inside Finish's transaction). */
export async function incrementTotalXp(db: Db, userId: string, amount: number): Promise<number> {
  const profile = await db.profile.update({ where: { userId }, data: { totalXp: { increment: amount } }, select: { totalXp: true } });
  return profile.totalXp;
}

async function withLatestBodyweight(row: ProfileRow): Promise<ProfileRecord> {
  const latest = await prisma.bodyweightEntry.findFirst({
    where: { userId: row.userId },
    orderBy: { measuredOn: "desc" },
    select: { kg: true },
  });
  return { ...row, bodyweightKg: latest?.kg ?? null };
}

/** Today's calendar date in UTC, as Postgres DATE columns want it (midnight, no time). */
export function todayUtc(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}
