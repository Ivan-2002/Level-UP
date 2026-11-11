-- kg/lb support. Weights stay stored in kg; players choose the unit they type and read.
--
-- The weight columns get 3 decimals (DECIMAL(7,3)) so lb input converts back exactly:
-- 135 lb = 61.235 kg -> 135 lb. With 2 decimals it came back as 134.99 lb.
-- Both changes only WIDEN the column (5,2 -> 7,3 and 5,1 -> 7,3: more integer digits and
-- more decimals), so every existing value is kept exactly; Postgres only adds trailing
-- zeros. Changing a column type rewrites the table under a lock: instant at our size,
-- but on a large production table this belongs in a quiet maintenance window.

-- CreateEnum
CREATE TYPE "weight_unit" AS ENUM ('kg', 'lb');

-- AlterTable
ALTER TABLE "bodyweight_entry" ALTER COLUMN "kg" SET DATA TYPE DECIMAL(7,3);

-- AlterTable
ALTER TABLE "profile" ADD COLUMN     "weightUnit" "weight_unit" NOT NULL DEFAULT 'kg';

-- AlterTable
ALTER TABLE "workout_set" ALTER COLUMN "weightKg" SET DATA TYPE DECIMAL(7,3);
