-- bodyweight_entry.received_at: when the server last WROTE the entry. The XP bodyweight
-- rule orders entries by it and measures the time between them with it, never with
-- measured_on (which the player chooses, so it could be backdated).

-- AlterTable: the default fills every existing row with the migration's own time...
ALTER TABLE "bodyweight_entry" ADD COLUMN     "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ...so (hand-edited) existing rows take the best receive time we have: when they were
-- created. For an entry re-entered since, its real last write is later and unknown;
-- createdAt is the cautious choice, because a shorter gap between entries allows LESS change.
UPDATE "bodyweight_entry" SET "receivedAt" = "createdAt";
