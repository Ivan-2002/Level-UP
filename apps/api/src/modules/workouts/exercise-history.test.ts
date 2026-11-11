import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { exerciseSummarySchema, recentExerciseListSchema } from "@levelup/shared";
import { app, seedExercises, signUpPlayer, type TestUser } from "../../test/helpers.js";

const DAY = 24 * 60 * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

let ids: Record<string, string>;
let user: TestUser;

beforeEach(async () => {
  ids = await seedExercises();
  user = await signUpPlayer({ bodyweightKg: 80 });
});

/** Logs one workout `daysAgo` with the given sets per exercise slug. */
async function log(as: TestUser, daysAgo: number, exercises: [string, [reps: number, kg: number][]][]) {
  const startedAt = Date.now() - daysAgo * DAY - 2 * 3_600_000;
  const res = await request(app)
    .post("/workouts")
    .set("Cookie", as.cookie)
    .send({
      clientId: randomUUID(),
      startedAt: iso(startedAt),
      finishedAt: iso(startedAt + 3_600_000),
      exercises: exercises.map(([slug, sets]) => ({ exerciseId: ids[slug], sets: sets.map(([reps, weightKg]) => ({ reps, weightKg })) })),
    });
  expect(res.status, res.text).toBe(201);
  return iso(startedAt);
}

const summary = async (exerciseId: string, query = "") => {
  const res = await request(app).get(`/exercises/${exerciseId}/summary${query}`).set("Cookie", user.cookie);
  return { status: res.status, body: res.body };
};

describe("GET /exercises/:id/summary", () => {
  it("needs a session", async () => {
    expect((await request(app).get(`/exercises/${ids["deadlift"]}/summary`)).status).toBe(401);
  });

  it("is empty for an exercise never done", async () => {
    const { status, body } = await summary(ids["deadlift"]!);

    expect(status).toBe(200);
    expect(exerciseSummarySchema.parse(body)).toMatchObject({
      exercise: { name: "Deadlift" },
      bodyweightKg: 80,
      previousSession: null,
      records: { bestE1rm: null, heaviestSet: null, bestSessionVolume: null, mostReps: null },
      sessions: [],
    });
  });

  it("returns the previous session, all-time records and the trend, newest first", async () => {
    const day3 = await log(user, 3, [["barbell-bench-press", [[8, 60], [8, 60], [8, 60]]]]); // volume 1440
    const day2 = await log(user, 2, [["barbell-bench-press", [[3, 80]]]]); // e1RM 80 x 1.1 = 88
    const day1 = await log(user, 1, [["barbell-bench-press", [[15, 40], [8, 62.5]]]]);

    const { body } = await summary(ids["barbell-bench-press"]!);
    const parsed = exerciseSummarySchema.parse(body);

    expect(parsed.previousSession).toMatchObject({ startedAt: day1, sets: [{ reps: 15, weightKg: 40 }, { reps: 8, weightKg: 62.5 }] });
    expect(parsed.records).toEqual({
      bestE1rm: { value: 88, reps: 3, weightKg: 80, date: day2 },
      heaviestSet: { reps: 3, weightKg: 80, loadKg: 80, date: day2 },
      bestSessionVolume: { volumeKg: 1440, date: day3 },
      mostReps: { reps: 15, weightKg: 40, date: day1 },
    });
    expect(parsed.sessions.map((s) => [s.startedAt, s.bestE1rm, s.topSet])).toEqual([
      [day1, 79.2, { reps: 8, weightKg: 62.5 }], // 15 reps has no e1RM; 62.5 x 8 = 79.2
      [day2, 88, { reps: 3, weightKg: 80 }],
      [day3, 76, { reps: 8, weightKg: 60 }],
    ]);
  });

  it("limits the trend with ?sessions=", async () => {
    for (const daysAgo of [4, 3, 2, 1]) await log(user, daysAgo, [["deadlift", [[5, 100 + daysAgo]]]]);

    const { body } = await summary(ids["deadlift"]!, "?sessions=2");

    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0].sets).toEqual([{ reps: 5, weightKg: 101 }]); // newest first
  });

  it("counts bodyweight in a bodyweight exercise's records, and reports that day's bodyweight", async () => {
    await log(user, 1, [["pull-up", [[8, 10]]]]); // 90 kg lifted -> e1RM 114

    const { body } = await summary(ids["pull-up"]!);

    expect(body.records.bestE1rm).toMatchObject({ value: 114, weightKg: 10 });
    expect(body.sessions[0].bodyweightKg).toBe(80);
  });

  it("never includes another player's workouts", async () => {
    await log(await signUpPlayer(), 1, [["deadlift", [[5, 200]]]]);

    const { body } = await summary(ids["deadlift"]!);

    expect(body.sessions).toEqual([]);
  });

  it("is a 404 for an unknown exercise or a malformed id", async () => {
    expect((await summary(randomUUID())).status).toBe(404);
    expect((await summary("bench")).status).toBe(404);
  });
});

describe("GET /exercises/recent", () => {
  it("lists distinct exercises by last use, with that session's sets", async () => {
    await log(user, 3, [["deadlift", [[5, 120]]], ["pull-up", [[8, 0]]]]);
    await log(user, 1, [["barbell-bench-press", [[8, 60]]], ["deadlift", [[5, 125]]]]);
    await log(await signUpPlayer(), 0, [["plank", [[60, 0]]]]); // someone else's

    const res = await request(app).get("/exercises/recent").set("Cookie", user.cookie);

    expect(res.status).toBe(200);
    expect(recentExerciseListSchema.parse(res.body).items.map((i) => [i.exercise.name, i.lastSets])).toEqual([
      ["Bench Press", [{ reps: 8, weightKg: 60 }]],
      ["Deadlift", [{ reps: 5, weightKg: 125 }]],
      ["Pull-up", [{ reps: 8, weightKg: 0 }]],
    ]);
  });

  it("needs a session", async () => {
    expect((await request(app).get("/exercises/recent")).status).toBe(401);
  });
});
