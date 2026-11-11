-- Milestone 4c: routines, rest preferences, the XP ledger, set completion times, and
-- bodyweight as a dated history (generated with `prisma migrate diff`, then edited:
-- see the data move at the end).

-- CreateEnum
CREATE TYPE "mechanic" AS ENUM ('compound', 'isolation');

-- CreateEnum
CREATE TYPE "xp_source" AS ENUM ('workout_set', 'weekly_target', 'streak');

-- AlterTable
ALTER TABLE "exercise" ADD COLUMN     "mechanic" "mechanic" NOT NULL DEFAULT 'isolation',
ADD COLUMN     "suggestedRestSec" INTEGER NOT NULL DEFAULT 90;

-- AlterTable
ALTER TABLE "workout" ADD COLUMN     "routineId" UUID;

-- AlterTable
ALTER TABLE "workout_exercise" ADD COLUMN     "restSec" INTEGER;

-- AlterTable
ALTER TABLE "workout_set" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "flagReason" TEXT,
ADD COLUMN     "isFlagged" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "bodyweight_entry" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "kg" DECIMAL(5,1) NOT NULL,
    "measuredOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bodyweight_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_preference" (
    "userId" TEXT NOT NULL,
    "exerciseId" UUID NOT NULL,
    "restSec" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercise_preference_pkey" PRIMARY KEY ("userId","exerciseId")
);

-- CreateTable
CREATE TABLE "routine" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_exercise" (
    "id" UUID NOT NULL,
    "routineId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "targetSets" INTEGER NOT NULL,
    "targetReps" INTEGER NOT NULL,
    "restSec" INTEGER,

    CONSTRAINT "routine_exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_event" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" "xp_source" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "bodyPart" "body_part",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bodyweight_entry_userId_measuredOn_key" ON "bodyweight_entry"("userId", "measuredOn");

-- CreateIndex
CREATE INDEX "routine_userId_idx" ON "routine"("userId");

-- CreateIndex
CREATE INDEX "routine_exercise_exerciseId_idx" ON "routine_exercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "routine_exercise_routineId_order_key" ON "routine_exercise"("routineId", "order");

-- CreateIndex
CREATE INDEX "xp_event_userId_createdAt_idx" ON "xp_event"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "xp_event_source_sourceId_key" ON "xp_event"("source", "sourceId");

-- CreateIndex
CREATE INDEX "workout_routineId_idx" ON "workout"("routineId");

-- AddForeignKey
ALTER TABLE "bodyweight_entry" ADD CONSTRAINT "bodyweight_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_preference" ADD CONSTRAINT "exercise_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_preference" ADD CONSTRAINT "exercise_preference_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine" ADD CONSTRAINT "routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercise" ADD CONSTRAINT "routine_exercise_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercise" ADD CONSTRAINT "routine_exercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout" ADD CONSTRAINT "workout_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_event" ADD CONSTRAINT "xp_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data move (hand-written): copy each profile's bodyweight into the new history table,
-- dated the day the profile was created, BEFORE dropping the old column. Prisma's
-- generated SQL dropped the column first, which would have lost the values.
INSERT INTO "bodyweight_entry" ("id", "userId", "kg", "measuredOn")
SELECT gen_random_uuid(), "userId", "bodyweightKg", "createdAt"::date
FROM "profile"
WHERE "bodyweightKg" IS NOT NULL;

-- AlterTable
ALTER TABLE "profile" DROP COLUMN "bodyweightKg";
