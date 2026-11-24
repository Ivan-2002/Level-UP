import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DAILY_XP_CAP,
  epleyOneRepMax,
  exerciseXpHistoryListSchema,
  finishWorkoutResponseSchema,
  JUMP_CAP,
  type FinishWorkoutInput,
} from "@levelup/shared";
import { setNow } from "../../lib/clock.js";
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
    await finish(
      user,
      workout(10, [
        ["barbell-bench-press", [{ reps: 8, weightKg: 60 }]],
        ["pull-up", [{ reps: 8, weightKg: 0 }]],
      ]),
    );

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

  it("keeps a jump-capped set at the line for the baseline, out of the 12-week best, and leaves out flagged sets", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75 });
    await finish(user, workout(3, [["barbell-bench-press", [{ reps: 8, weightKg: 60 }]]]));
    await finish(
      user,
      workout(2, [
        [
          "barbell-bench-press",
          [
            { reps: 8, weightKg: 100 },
            { reps: 8, weightKg: 400 },
          ],
        ],
      ]),
    ); // capped; flagged

    const [bench] = await xpHistory(user);

    expect(bench!.jumpBaseline).toBeCloseTo(epleyOneRepMax(60, 8) * (1 + JUMP_CAP.maxJump));
    expect(bench!.recentBest).toBeCloseTo(epleyOneRepMax(60, 8)); // neither the capped 100 kg nor the flagged 400 kg
  });

  it("only ever includes the player's own workouts", async () => {
    const other = await signUpPlayer();
    await finish(other, workout(1, [["barbell-bench-press", [{ reps: 8, weightKg: 60 }]]]));

    expect(await xpHistory(await signUpPlayer())).toEqual([]);
  });
});

describe("GET /v1/exercises/xp-history: the daily cap for the live preview", () => {
  // Auckland is UTC+13 in October: the player's local day and the UTC day differ for most
  // of the morning, so these tests show "today" is the PROFILE's day, as Finish dates XP.
  const TZ = "Pacific/Auckland";
  const local = (time: string) => new Date(`${time}+13:00`);

  async function finishAt(user: TestUser, startLocal: string) {
    const startedAt = local(startLocal);
    const body: FinishWorkoutInput = {
      clientId: randomUUID(),
      startedAt: startedAt.toISOString(),
      finishedAt: iso(startedAt.getTime() + 30 * MINUTE),
      exercises: [
        {
          exerciseId: ids["barbell-bench-press"]!,
          sets: [
            { reps: 8, weightKg: 60 },
            { reps: 8, weightKg: 60 },
          ],
        },
      ],
    };
    setNow(new Date(startedAt.getTime() + 30 * MINUTE));
    const res = await request(app).post("/v1/workouts").set("Cookie", user.cookie).send(body);
    expect(res.status, res.text).toBe(201);
    return { clientId: body.clientId, setXp: finishWorkoutResponseSchema.parse(res.body).summary.xp.sets };
  }

  it("sends the cap's values, so the app never hardcodes them", async () => {
    const res = await request(app)
      .get("/v1/exercises/xp-history")
      .set("Cookie", (await signUpPlayer()).cookie);
    expect(exerciseXpHistoryListSchema.parse(res.body).dailyCap).toEqual({
      limit: DAILY_XP_CAP.limit,
      bandRate: DAILY_XP_CAP.bandRate,
      ceilingMultiple: DAILY_XP_CAP.ceilingMultiple,
    });
  });

  it("counts today's set XP and the workouts in it by the LOCAL day each started", async () => {
    setNow(local("2026-10-14T08:00:00"));
    const user = await signUpPlayer({ timeZone: TZ });
    const yesterday = await finishAt(user, "2026-10-14T22:00:00"); // 09:00 UTC on the 14th
    const today = await finishAt(user, "2026-10-15T00:30:00"); // 11:30 UTC, also on the 14th

    setNow(local("2026-10-15T03:00:00"));
    const res = await request(app).get("/v1/exercises/xp-history").set("Cookie", user.cookie);

    expect(exerciseXpHistoryListSchema.parse(res.body).today).toEqual({
      date: "2026-10-15",
      setXp: today.setXp,
      clientIds: [today.clientId],
    });
    expect(today.setXp).toBeGreaterThan(0);
    expect(yesterday.setXp).toBeGreaterThan(0); // left out for its day, not for having no XP
  });

  it("is an empty day before the first workout today", async () => {
    setNow(local("2026-10-15T03:00:00"));
    const res = await request(app)
      .get("/v1/exercises/xp-history")
      .set("Cookie", (await signUpPlayer({ timeZone: TZ })).cookie);
    expect(exerciseXpHistoryListSchema.parse(res.body).today).toEqual({ date: "2026-10-15", setXp: 0, clientIds: [] });
  });
});
