-- AlterTable
ALTER TABLE "profile" ADD COLUMN     "celebratedLevel" INTEGER NOT NULL DEFAULT 1;

-- A level is never celebrated below 1.
ALTER TABLE "profile" ADD CONSTRAINT "profile_celebratedLevel_check" CHECK ("celebratedLevel" >= 1);

-- Existing players start at their CURRENT level, so nobody gets a burst of old level-ups.
-- The level formula of packages/shared (levelFromXp: the highest level whose
-- round(400 x (level - 1)^2.15) is at or below total XP), copied here once because a
-- migration can't call TypeScript. Checked against levelFromXp at every boundary to level 300.
UPDATE "profile" p SET "celebratedLevel" = (
  SELECT max(l) FROM generate_series(1, 2000) AS l
  WHERE round(400 * power(l - 1, 2.15)) <= p."totalXp"
);
