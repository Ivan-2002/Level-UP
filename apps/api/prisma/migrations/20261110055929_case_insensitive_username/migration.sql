-- citext is a built-in Postgres extension: text that compares case-insensitively.
-- Prisma doesn't create extensions for us, so it is enabled here by hand.
CREATE EXTENSION IF NOT EXISTS citext;

-- AlterTable: "IvanLifts" is stored as typed, but the unique index now treats
-- "ivanlifts" as the same username.
ALTER TABLE "profile" ALTER COLUMN "username" SET DATA TYPE CITEXT;
