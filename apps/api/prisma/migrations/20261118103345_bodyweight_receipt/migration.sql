-- CreateTable
CREATE TABLE "bodyweight_receipt" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "kg" DECIMAL(7,3) NOT NULL,
    "measuredOn" DATE NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bodyweight_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bodyweight_receipt_userId_receivedAt_idx" ON "bodyweight_receipt"("userId", "receivedAt");

-- AddForeignKey
ALTER TABLE "bodyweight_receipt" ADD CONSTRAINT "bodyweight_receipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one receipt per existing entry, at its last write. Earlier edits weren't
-- recorded, so their history is lost (pre-launch test data only).
INSERT INTO "bodyweight_receipt" ("id", "userId", "kg", "measuredOn", "receivedAt")
SELECT gen_random_uuid(), "userId", "kg", "measuredOn", "receivedAt" FROM "bodyweight_entry";
