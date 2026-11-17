-- xp_event.earned_on: the player's LOCAL calendar day each XP gain belongs to (the daily
-- cap's day). Hand-edited: Prisma would add the column as NOT NULL straight away, which
-- fails on a table that already has rows. Instead: add it nullable, fill it in, then
-- require it.

-- AlterTable
ALTER TABLE "xp_event" ADD COLUMN "earnedOn" DATE;

-- The backfill (between the markers below) is also run by an integration test
-- (xp-event-earned-on.test.ts), which checks its dates against the shared localDate function.
-- Timestamps are stored without a zone and mean UTC, so "AT TIME ZONE 'UTC'" first makes
-- them a real instant, and "AT TIME ZONE <the player's zone>" turns that into local time.
-- The profile's CURRENT zone is used (past zones aren't stored), as training days do.

-- backfill:start
-- Set XP: the day the workout started.
UPDATE "xp_event" AS e
SET "earnedOn" = ((w."startedAt" AT TIME ZONE 'UTC') AT TIME ZONE p."timeZone")::date
FROM "workout_set" AS s
JOIN "workout_exercise" AS we ON we."id" = s."workoutExerciseId"
JOIN "workout" AS w ON w."id" = we."workoutId"
JOIN "profile" AS p ON p."userId" = w."userId"
WHERE e."source" = 'workout_set' AND e."sourceId" = s."id"::text;

-- Bonuses (sourceId = the week): the day the workout that met the goal started, or the
-- week's Monday when no workout is recorded (e.g. the goal was found met by a recount).
UPDATE "xp_event" AS e
SET "earnedOn" = COALESCE(((w."startedAt" AT TIME ZONE 'UTC') AT TIME ZONE p."timeZone")::date, g."weekStart")
FROM "weekly_goal" AS g
LEFT JOIN "workout" AS w ON w."id" = g."metByWorkoutId"
LEFT JOIN "profile" AS p ON p."userId" = w."userId"
WHERE e."source" IN ('weekly_goal', 'streak_milestone') AND e."sourceId" = g."id"::text;

-- Anything left points at a row that no longer exists (none expected): the UTC day it was
-- recorded, so the column can still be required. ("createdAt" is already a UTC wall-clock
-- time, so a plain cast gives its UTC day; converting it to timestamptz first would make
-- the cast depend on the database session's zone.)
UPDATE "xp_event" SET "earnedOn" = "createdAt"::date WHERE "earnedOn" IS NULL;
-- backfill:end

ALTER TABLE "xp_event" ALTER COLUMN "earnedOn" SET NOT NULL;

-- CreateIndex
CREATE INDEX "xp_event_userId_earnedOn_idx" ON "xp_event"("userId", "earnedOn");
