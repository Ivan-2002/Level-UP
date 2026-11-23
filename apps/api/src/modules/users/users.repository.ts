import { now } from "../../lib/clock.js";
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
  weightUnit: "kg" | "lb";
  timeZone: string;
  /** Sign-up moment: decides whether the first week is a warm-up. */
  createdAt: Date;
};

export async function findProfileByUserId(userId: string): Promise<ProfileRecord | null> {
  const row = await prisma.profile.findUnique({ where: { userId } });
  return row ? withLatestBodyweight(row) : null;
}

/** The user id for a sign-in email, ignoring case (Better Auth's user table). Dev tools only. */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const row = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  return row?.id ?? null;
}

export async function profileExists(userId: string): Promise<boolean> {
  return (await prisma.profile.count({ where: { userId } })) > 0;
}

/** Changes only the given fields. null = this user has no profile. */
export async function updateProfile(userId: string, data: { weightUnit?: "kg" | "lb"; timeZone?: string }): Promise<ProfileRecord | null> {
  const { count } = await prisma.profile.updateMany({ where: { userId }, data });
  return count === 0 ? null : findProfileByUserId(userId);
}

/**
 * Raises celebratedLevel to `level` unless it's already higher, in ONE statement: two
 * phones (or a retry racing the first request) can't lower it. null = no profile.
 */
export async function raiseCelebratedLevel(userId: string, level: number): Promise<ProfileRecord | null> {
  const count = await prisma.$executeRaw`
    UPDATE "profile" SET "celebratedLevel" = GREATEST("celebratedLevel", ${level}), "updatedAt" = now()
    WHERE "userId" = ${userId}`;
  return count === 0 ? null : findProfileByUserId(userId);
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
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.profile.create({ data: profile });
      if (bodyweightKg !== undefined) await writeBodyweight(tx, { userId: data.userId, kg: bodyweightKg, measuredOn: todayUtc(), receivedAt: now() });
      return created;
    });
    return withLatestBodyweight(row);
  } catch (err) {
    // P2002 = Prisma's code for "unique constraint failed".
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return "duplicate";
    }
    throw err;
  }
}

/**
 * One entry per day: recording a date's weight again replaces it. Every write ALSO adds a
 * receipt (bodyweight_receipt, append-only), in the same transaction: the XP bodyweight
 * rule walks the receipts, so re-entering a date (even every date) adds to the history the
 * 2% a week limit is measured against instead of erasing it.
 */
export function upsertBodyweight(userId: string, kg: number, measuredOn: Date) {
  return prisma.$transaction((tx) => writeBodyweight(tx, { userId, kg, measuredOn, receivedAt: now() }));
}

/** The two writes behind every bodyweight a player records: the day's entry and its receipt. */
async function writeBodyweight(db: Db, data: { userId: string; kg: number; measuredOn: Date; receivedAt: Date }) {
  const { userId, measuredOn } = data;
  const entry = await db.bodyweightEntry.upsert({
    where: { userId_measuredOn: { userId, measuredOn } },
    create: data,
    update: { kg: data.kg, receivedAt: data.receivedAt },
  });
  await db.bodyweightReceipt.create({ data });
  return entry;
}

/** Every bodyweight receipt, in the order the server received them. */
export function findBodyweightReceipts(userId: string, db: Db = prisma) {
  return db.bodyweightReceipt.findMany({
    where: { userId },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    select: { kg: true, measuredOn: true, receivedAt: true },
  });
}

export function findBodyweightEntries(userId: string, db: Db = prisma) {
  return db.bodyweightEntry.findMany({
    where: { userId },
    orderBy: { measuredOn: "asc" },
    select: { kg: true, measuredOn: true, receivedAt: true },
  });
}

/**
 * The player's time zone and sign-up moment, LOCKING their profile row until the
 * transaction ends. Two requests rolling over the same player's weeks at once (opening
 * the app while a Finish is saving) then run one after the other, never interleaved.
 */
export async function lockGoalContext(db: Db, userId: string): Promise<{ timeZone: string; createdAt: Date } | null> {
  const rows = await db.$queryRaw<{ timeZone: string; createdAt: Date }[]>`
    SELECT "timeZone", "createdAt" FROM "profile" WHERE "userId" = ${userId} FOR UPDATE`;
  return rows[0] ?? null;
}

/** When the player created their character: the start of the bodyweight grace week. */
export async function findProfileCreatedAt(userId: string, db: Db = prisma): Promise<Date | null> {
  const row = await db.profile.findUnique({ where: { userId }, select: { createdAt: true } });
  return row?.createdAt ?? null;
}

export async function findTimeZone(userId: string): Promise<string | null> {
  const row = await prisma.profile.findUnique({ where: { userId }, select: { timeZone: true } });
  return row?.timeZone ?? null;
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

/** Today's calendar date in UTC (by the clock, now()), as Postgres DATE columns want it (midnight, no time). */
export function todayUtc(): Date {
  return new Date(now().toISOString().slice(0, 10));
}
