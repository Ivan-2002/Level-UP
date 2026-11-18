-- CreateEnum
CREATE TYPE "xp_held_back_reason" AS ENUM ('daily_cap', 'too_old');

-- AlterTable
ALTER TABLE "workout" ADD COLUMN     "xpHeldBack" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xpHeldBackReason" "xp_held_back_reason";

-- Hand-edited: Prisma's schema language has no CHECK constraints, so this one lives only
-- here (Prisma leaves constraints it doesn't model alone). It keeps the pair consistent:
-- nothing held back <=> no reason, and never a negative amount. Every existing workout
-- (0, NULL) already satisfies it.
ALTER TABLE "workout" ADD CONSTRAINT "workout_xp_held_back_check"
  CHECK ("xpHeldBack" >= 0 AND (("xpHeldBack" = 0) = ("xpHeldBackReason" IS NULL)));
