-- CreateEnum
CREATE TYPE "body_part" AS ENUM ('chest', 'back', 'shoulders', 'arms', 'core', 'legs');

-- CreateEnum
CREATE TYPE "equipment" AS ENUM ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell');

-- CreateTable
CREATE TABLE "exercise" (
    "id" UUID NOT NULL,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "muscleGroup" TEXT NOT NULL,
    "bodyPart" "body_part" NOT NULL,
    "equipment" "equipment" NOT NULL,
    "loadFactor" DECIMAL(4,2) NOT NULL,
    "bodyweightRatio" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_exercise" (
    "id" UUID NOT NULL,
    "workoutId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "workout_exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_set" (
    "id" UUID NOT NULL,
    "workoutExerciseId" UUID NOT NULL,
    "setOrder" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weightKg" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "workout_set_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exercise_slug_key" ON "exercise"("slug");

-- CreateIndex
CREATE INDEX "exercise_ownerId_idx" ON "exercise"("ownerId");

-- CreateIndex
CREATE INDEX "workout_userId_startedAt_id_idx" ON "workout"("userId", "startedAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "workout_userId_clientId_key" ON "workout"("userId", "clientId");

-- CreateIndex
CREATE INDEX "workout_exercise_exerciseId_idx" ON "workout_exercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "workout_exercise_workoutId_order_key" ON "workout_exercise"("workoutId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "workout_set_workoutExerciseId_setOrder_key" ON "workout_set"("workoutExerciseId", "setOrder");

-- AddForeignKey
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout" ADD CONSTRAINT "workout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercise" ADD CONSTRAINT "workout_exercise_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercise" ADD CONSTRAINT "workout_exercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_set" ADD CONSTRAINT "workout_set_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "workout_exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
