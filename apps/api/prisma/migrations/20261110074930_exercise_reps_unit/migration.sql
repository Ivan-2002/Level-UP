-- CreateEnum
CREATE TYPE "reps_unit" AS ENUM ('reps', 'seconds');

-- AlterTable
ALTER TABLE "exercise" ADD COLUMN     "repsUnit" "reps_unit" NOT NULL DEFAULT 'reps';
