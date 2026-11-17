import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { epleyOneRepMax, exerciseXpHistoryListSchema, JUMP_CAP, type FinishWorkoutInput } from "@levelup/shared";
import { app, seedExercises, signUpPlayer, type TestUser } from "../../test/helpers.js";

// GET /v1/exercises/xp-history: each exercise's 12-week best and jump baseline, for the
// app's offline XP preview. The same calculation Finish uses (progression.xpHistories).

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();

let ids: Record<string, string>;

beforeEach(async () => {
  ids = await seedExercises();
});

type SetInput = { reps: number; weightKg: number };

function workout(daysAgo: number, exercises: [slug: string, sets: SetInput[]][]): FinishWorkoutInput {
  const startedAt = Date.now() - daysAgo * DAY - 2 * 60 * MINUTE;
  return {
    clientId: randomUUID(),
    startedAt: iso(startedAt),
    finishedAt: iso(startedAt + 60 * MINUTE),
    exercises: exercises.map(([slug, sets]) => ({ exerciseId: ids[slug]!, sets })),
  };
}

async function finish(user: TestUser, body: FinishWorkoutInput) {
  const res = await request(app).post("/v1/workouts").set("Cookie", user.cookie).send(body);
  expect(res.status, res.text).toBe(201);
}

async function xpHistory(user: TestUser) {
  const res = await request(app).get("/v1/exercises/xp-history").set("Cookie", user.cookie);
  expect(res.status).toBe(200);
  return exerciseXpHistoryListSchema.parse(res.body).items;
}

describe("GET /v1/exercises/xp-history", () => {
  it("needs a session", async () => {
    expect((await request(app).get("/v1/exercises/xp-history")).status).toBe(401);
  });

  it("is empty before the first workout", async () => {
    expect(await xpHistory(await signUpPlayer())).toEqual([]);
  });

  it("gives each exercise done its 12-week best and jump baseline (estimated 1RM, lifted kg)", async () => {
    const user = await signUpPlayer({ bodyweightKg: 80 });
    await finish(user, workout(100, [["barbell-bench-press", [{ reps: 5, weightKg: 90 }]]])); // outside 12 weeks
    await finish(user, workout(10, [["barbell-bench-press", [{ reps: 8, weightKg: 60 }]], ["pull-up", [{ reps: 8, weightKg: 0 }]]]));

    const items = await xpHistory(user);

    expect(items).toHaveLength(2);
    expect(items.find((i) => i.exerciseId === ids["barbell-bench-press"])).toEqual({
      exerciseId: ids["barbell-bench-press"],
      recentBest: epleyOneRepMax(60, 8), // the 100-day-old 90 x 5 is outside the window...
      jumpBaseline: epleyOneRepMax(90, 5), // ...but the jump baseline remembers it
    });
    // A pull-up lifts the bodyweight: 80 kg x 8.
    expect(items.find((i) => i.exerciseId === ids["pull-up"])).toMatchObject({ recentBest: epleyOneRepMax(80, 8) });
  });

  it("keeps a jump-capped session at the line and leaves out flagged sets", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75 });
    await finish(user, workout(3, [["barbell-bench-press", [{ reps: 8, weightKg: 60 }]]]));
    await finish(user, workout(2, [["barbell-bench-press", [{ reps: 8, weightKg: 100 }, { reps: 8, weightKg: 400 }]]])); // capped; flagged

    const [bench] = await xpHistory(user);

    expect(bench!.jumpBaseline).toBeCloseTo(epleyOneRepMax(60, 8) * (1 + JUMP_CAP.maxJump));
    expect(bench!.recentBest).toBeCloseTo(epleyOneRepMax(100, 8)); // not 400 kg
  });

  it("only ever includes the player's own workouts", async () => {
    const other = await signUpPlayer();
    await finish(other, workout(1, [["barbell-bench-press", [{ reps: 8, weightKg: 60 }]]]));

    expect(await xpHistory(await signUpPlayer())).toEqual([]);
  });
});
