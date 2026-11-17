-- Plausibility overrides per exercise (Milestone 5). Null = the equipment x mechanic default
-- in packages/shared (xp-limits.ts). The values come from the catalog: run `pnpm db:seed`.

-- AlterTable
ALTER TABLE "exercise" ADD COLUMN     "maxPlausibleReps" INTEGER,
ADD COLUMN     "maxPlausibleWeightKg" DECIMAL(7,3);
