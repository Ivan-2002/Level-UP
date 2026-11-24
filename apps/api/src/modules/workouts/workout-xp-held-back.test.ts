import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app, seedExercises, signUpPlayer } from "../../test/helpers.js";

// workout.xp_held_back + xp_held_back_reason: the set XP a workout didn't get (daily cap or
// the 14-day rule). Phase 3 writes them; here: the defaults, and the CHECK constraint that
// keeps the pair consistent even if a future bug (or a hand-written query) tries otherwise.

let workoutId: string;

beforeEach(async () => {
  const ids = await seedExercises();
  const user = await signUpPlayer();
  const startedAt = Date.now() - 2 * 3_600_000;
  const res = await request(app)
    .post("/v1/workouts")
    .set("Cookie", user.cookie)
    .send({
      clientId: randomUUID(),
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(startedAt + 3_600_000).toISOString(),
      exercises: [{ exerciseId: ids["barbell-bench-press"], sets: [{ reps: 8, weightKg: 60 }] }],
    });
  workoutId = res.body.workout.id;
});

const holdBack = (xpHeldBack: number, xpHeldBackReason: "daily_cap" | "too_old" | null) =>
  prisma.workout.update({ where: { id: workoutId }, data: { xpHeldBack, xpHeldBackReason } });

describe("workout XP held back", () => {
  it("starts at nothing held back, and no reason", async () => {
    expect(await prisma.workout.findUniqueOrThrow({ where: { id: workoutId } })).toMatchObject({
      xpHeldBack: 0,
      xpHeldBackReason: null,
    });
  });

  it("accepts an amount WITH its reason", async () => {
    await expect(holdBack(640, "daily_cap")).resolves.toMatchObject({ xpHeldBack: 640, xpHeldBackReason: "daily_cap" });
  });

  it.each([
    ["an amount without a reason", 640, null],
    ["a reason without an amount", 0, "too_old"],
    ["a negative amount", -5, "daily_cap"],
  ] as const)("refuses %s (CHECK constraint)", async (_case, amount, reason) => {
    await expect(holdBack(amount, reason)).rejects.toThrow(/workout_xp_held_back_check/);
  });
});
