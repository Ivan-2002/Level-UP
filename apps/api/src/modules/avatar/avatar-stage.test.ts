import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { finishWorkoutResponseSchema, profileSchema, xpForLevel } from "@levelup/shared";
import { prisma } from "../../lib/prisma.js";
import { app, seedExercises, signUpPlayer, type TestUser } from "../../test/helpers.js";

// Avatar stages are data (the avatar_stage table, filled by its migration). The player's
// stage is derived from their level on every read: the profile has it, and the Finish
// summary has the stage before and after the workout.

const MINUTE = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const ROOKIE = { key: "rookie", name: "Rookie", levelRequired: 1, extras: [] };
const REGULAR = { key: "regular", name: "Regular", levelRequired: 4, extras: ["wristbands"] };

let ids: Record<string, string>;
beforeEach(async () => {
  ids = await seedExercises();
});

/** XP earned earlier (a ledger row and the cached total), so the next workout starts from it. */
async function giveXp(user: TestUser, amount: number) {
  await prisma.xpEvent.create({
    data: {
      userId: user.userId,
      amount,
      source: "streak_milestone",
      sourceId: randomUUID(),
      earnedOn: new Date("2026-01-05"),
      createdAt: new Date(Date.now() - 60 * MINUTE),
    },
  });
  await prisma.profile.update({ where: { userId: user.userId }, data: { totalXp: { increment: amount } } });
}

async function profileOf(user: TestUser) {
  const res = await request(app).get("/v1/profile").set("Cookie", user.cookie);
  expect(res.status, res.text).toBe(200);
  return profileSchema.parse(res.body);
}

/** Bench 3 x 8 x 60 kg at 75 kg bodyweight: 207 XP (finish-progression.test.ts). */
async function finishBench(user: TestUser) {
  const startedAt = Date.now() - 90 * MINUTE;
  const res = await request(app)
    .post("/v1/workouts")
    .set("Cookie", user.cookie)
    .send({
      clientId: randomUUID(),
      startedAt: iso(startedAt),
      finishedAt: iso(startedAt + 60 * MINUTE),
      exercises: [
        {
          exerciseId: ids["barbell-bench-press"]!,
          sets: [1, 2, 3].map((n) => ({ reps: 8, weightKg: 60, completedAt: iso(startedAt + n * 5 * MINUTE) })),
        },
      ],
    });
  expect(res.status, res.text).toBe(201);
  return finishWorkoutResponseSchema.parse(res.body).summary;
}

describe("avatar stages", () => {
  it("are the five stages of the decision log, as data", async () => {
    const rows = await prisma.avatarStage.findMany({ orderBy: { levelRequired: "asc" } });
    expect(rows.map((r) => [r.name, r.levelRequired])).toEqual([
      ["Rookie", 1],
      ["Regular", 4],
      ["Athlete", 10],
      ["Champion", 15],
      ["Legend", 20],
    ]);
  });

  it("carry their extras as data, cumulative (Legend has all four)", async () => {
    const rows = await prisma.avatarStage.findMany({ orderBy: { levelRequired: "asc" } });
    expect(rows.map((r) => [r.key, r.extras])).toEqual([
      ["rookie", []],
      ["regular", ["wristbands"]],
      ["athlete", ["wristbands", "outfit"]],
      ["champion", ["wristbands", "outfit", "headband"]],
      ["legend", ["wristbands", "outfit", "headband", "cape"]],
    ]);
  });

  it("gives the profile the stage of the player's level", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75 });
    expect((await profileOf(user)).stage).toEqual(ROOKIE);

    await giveXp(user, xpForLevel(4));
    expect(await profileOf(user)).toMatchObject({ level: { level: 4 }, stage: REGULAR });
  });

  it("puts a new stage in the Finish summary when the workout crosses its level", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75 });
    await giveXp(user, xpForLevel(4) - 100); // 207 XP of bench crosses level 4

    const summary = await finishBench(user);

    expect(summary.level).toMatchObject({ before: 3, after: 4 });
    expect(summary.stage).toEqual({ before: ROOKIE, after: REGULAR });
  });

  it("sends the same stage before and after when the level-up stays inside a stage", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75 });

    const summary = await finishBench(user); // level 1 -> 1

    expect(summary.stage).toEqual({ before: ROOKIE, after: ROOKIE });
  });
});
