-- Milestone 6a: body-part development (docs/ARCHITECTURE.md, "Avatar prototype").

-- AlterTable
ALTER TABLE "avatar_stage" ADD COLUMN     "extras" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "xp_event" ADD COLUMN     "stimulus" DECIMAL(5,3) NOT NULL DEFAULT 0;

-- Hand-edited below this line.

-- Existing set rows: their stimulus from the tag Finish stored on the set (the effort
-- itself wasn't stored before this migration). A set that counted in full (no tag, a
-- jump-capped set, a hold counted to 2:00) is 1; an easy set 0.4; anything else 0
-- (warm-ups, flagged sets and sets beyond the limit; the last two had no XP row anyway).
-- Pre-launch test data only. Bonus and dev_grant rows keep the default 0.
-- backfill:start
UPDATE "xp_event" AS e
SET "stimulus" = CASE
    WHEN s."xpTag" IS NULL OR s."xpTag" IN ('above_history', 'timed_limit') THEN 1
    WHEN s."xpTag" = 'easy_set' THEN 0.4
    ELSE 0
  END
FROM "workout_set" AS s
WHERE e."source" = 'workout_set' AND e."sourceId" = s."id"::text;
-- backfill:end

-- Prisma's schema language has no CHECK constraints, so this one lives only here.
-- - workout_set rows: a set's stimulus is its effort, 0 to 1.
-- - weekly_goal and streak_milestone rows: bonuses grow no body part, so 0.
-- - Everything else is left OPEN on purpose: dev_grant (the local-only dev script stages
--   development with it) and Milestone 7's `correction` rows, which carry a SIGNED stimulus
--   per body part, like their signed XP. A list of sources to constrain, not to allow, so
--   adding the correction source needs no change here.
ALTER TABLE "xp_event" ADD CONSTRAINT "xp_event_stimulus_check" CHECK (
  ("source" <> 'workout_set' OR "stimulus" BETWEEN 0 AND 1)
  AND ("source" NOT IN ('weekly_goal', 'streak_milestone') OR "stimulus" = 0)
);

-- The stages' extras, cumulative (decided 2026-11-24): data, not code.
UPDATE "avatar_stage" SET "extras" = ARRAY[]::TEXT[] WHERE "key" = 'rookie';
UPDATE "avatar_stage" SET "extras" = ARRAY['wristbands'] WHERE "key" = 'regular';
UPDATE "avatar_stage" SET "extras" = ARRAY['wristbands', 'outfit'] WHERE "key" = 'athlete';
UPDATE "avatar_stage" SET "extras" = ARRAY['wristbands', 'outfit', 'headband'] WHERE "key" = 'champion';
UPDATE "avatar_stage" SET "extras" = ARRAY['wristbands', 'outfit', 'headband', 'cape'] WHERE "key" = 'legend';
