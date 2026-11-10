import { prisma } from "../../lib/prisma.js";
import { Prisma, type Profile as ProfileRow } from "../../generated/prisma/client.js";

// The repository is the ONLY file in this module that talks to Prisma.
// It knows how data is stored (tables, Decimal columns, Prisma error codes) and
// nothing about business rules. Swapping Prisma for raw SQL would only touch this file.

export type { ProfileRow };

export type NewProfile = {
  userId: string;
  username: string;
  bodyweightKg?: number;
  weeklyTarget: number;
};

export function findProfileByUserId(userId: string): Promise<ProfileRow | null> {
  return prisma.profile.findUnique({ where: { userId } });
}

/** Case-insensitive, because the column is citext (see schema.prisma). */
export function findProfileByUsername(username: string): Promise<ProfileRow | null> {
  return prisma.profile.findUnique({ where: { username } });
}

/**
 * Inserts a profile. Returns "duplicate" instead of throwing when a unique constraint
 * fails (this user already has a profile, or the username is taken), because two
 * requests can race past the service's checks; the database is the final judge.
 */
export async function insertProfile(data: NewProfile): Promise<ProfileRow | "duplicate"> {
  try {
    return await prisma.profile.create({ data });
  } catch (err) {
    // P2002 = Prisma's code for "unique constraint failed".
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return "duplicate";
    }
    throw err;
  }
}
