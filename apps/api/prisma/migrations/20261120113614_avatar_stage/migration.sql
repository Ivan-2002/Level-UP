-- CreateTable
CREATE TABLE "avatar_stage" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "levelRequired" INTEGER NOT NULL,

    CONSTRAINT "avatar_stage_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "avatar_stage_levelRequired_key" ON "avatar_stage"("levelRequired");

-- A stage needs a level to unlock at; level 1 is the first.
ALTER TABLE "avatar_stage" ADD CONSTRAINT "avatar_stage_levelRequired_check" CHECK ("levelRequired" >= 1);

-- The stages (decision log, 2026-11-20). Data, not code: tune with a data change, and
-- only ever DOWN (a stage is derived from the level, so raising one takes it away).
INSERT INTO "avatar_stage" ("key", "name", "levelRequired") VALUES
  ('rookie', 'Rookie', 1),
  ('regular', 'Regular', 4),
  ('athlete', 'Athlete', 10),
  ('champion', 'Champion', 15),
  ('legend', 'Legend', 20);
