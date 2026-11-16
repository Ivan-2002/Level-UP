-- Weekly goal and streaks (replaces the weekly target chosen at sign-up).

-- CreateEnum
CREATE TYPE "week_kind" AS ENUM ('goal', 'warm_up');

-- AlterEnum (hand-edited): the bonus sources were placeholders that nothing ever wrote.
-- RENAME VALUE changes the label in place: no table rewrite, and any row would keep
-- its meaning. (Prisma's default recreates the type and casts every xp_event row.)
ALTER TYPE "xp_source" RENAME VALUE 'weekly_target' TO 'weekly_goal';
ALTER TYPE "xp_source" RENAME VALUE 'streak' TO 'streak_milestone';

-- AlterTable
-- weeklyTarget was the player's own choice (2 to 6). The weekly goal now starts everyone
-- at 2 and adjusts itself, so existing values are DROPPED, not carried over: each player's
-- first weekly_goal row is created at 2 the next time they open the app.
-- streakWeeks was never written (always 0); the streak now lives in weekly_goal.
-- timeZone starts as UTC for existing players; the app sends the phone's zone on its next start.
ALTER TABLE "profile" DROP COLUMN "streakWeeks",
DROP COLUMN "weeklyTarget",
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "weekly_goal" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "kind" "week_kind" NOT NULL DEFAULT 'goal',
    "target" INTEGER NOT NULL,
    "daysTrained" INTEGER NOT NULL DEFAULT 0,
    "met" BOOLEAN NOT NULL DEFAULT false,
    "streakAfter" INTEGER NOT NULL DEFAULT 0,
    "metByWorkoutId" UUID,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievement" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievement_pkey" PRIMARY KEY ("userId","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_goal_userId_weekStart_key" ON "weekly_goal"("userId", "weekStart");

-- AddForeignKey
ALTER TABLE "weekly_goal" ADD CONSTRAINT "weekly_goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_goal" ADD CONSTRAINT "weekly_goal_metByWorkoutId_fkey" FOREIGN KEY ("metByWorkoutId") REFERENCES "workout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

