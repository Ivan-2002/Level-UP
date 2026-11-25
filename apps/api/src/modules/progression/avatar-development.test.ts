import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { avatarResponseSchema, BODY_PARTS, finishWorkoutResponseSchema, xpForLevel } from "@levelup/shared";
import { setNow } from "../../lib/clock.js";
import { prisma } from "../../lib/prisma.js";
import { app, seedExercises, signUpPlayer, signUpUser, type TestUser } from "../../test/helpers.js";

// Milestone 6a: body-part development (docs/ARCHITECTURE.md, "Avatar prototype").
// - Finish writes each set's growth stimulus on its ledger row (xp_event.stimulus).
// - The CHECK keeps set rows in 0..1 and bonus rows at 0, and leaves other sources open.
// - The migration's backfill (its own SQL) fills existing rows from the stored tags.
// - GET /v1/avatar evaluates development on the player's local today.
// - The Finish summary's avatar before/after repeat exactly, also for a late sync.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ZEROS = Object.fromEntries(BODY_PARTS.map((p) => [p, 0]));

let ids: Record<string, string>;
beforeEach(async () => {
  ids = await seedExercises();
});
afterEach(() => setNow(null));

/** A player who signed up at `at` (a Monday 07:00 UTC by default), in UTC. */
async function player(at = "2026-10-05T07:00:00Z"): Promise<TestUser> {
  setNow(at);
  return signUpPlayer({ bodyweightKg: 75, timeZone: "UTC" });
}

type SetIn = { reps: number; weightKg: number };

/** Finishes a workout that started at `startedAt` and reached the server at `syncedAt`. */
async function finish(
  user: TestUser,
  startedAt: string,
  exercises: { slug: string; sets: SetIn[] }[],
  options: { syncedAt?: string; clientId?: string } = {},
) {
  const start = Date.parse(startedAt);
  setNow(options.syncedAt ?? new Date(start + 70 * MINUTE).toISOString());
  const res = await request(app)
    .post("/v1/workouts")
    .set("Cookie", user.cookie)
    .send({
      clientId: options.clientId ?? randomUUID(),
      startedAt,
      finishedAt: new Date(start + 60 * MINUTE).toISOString(),
      exercises: exercises.map((e) => ({
        exerciseId: ids[e.slug]!,
        sets: e.sets.map((s, i) => ({ ...s, completedAt: new Date(start + (i + 1) * 3 * MINUTE).toISOString() })),
      })),
    });
  expect([200, 201], res.text).toContain(res.status);
  return finishWorkoutResponseSchema.parse(res.body);
}

const bench = (n = 3): { slug: string; sets: SetIn[] } => ({
  slug: "barbell-bench-press",
  sets: Array.from({ length: n }, () => ({ reps: 8, weightKg: 60 })),
});

async function avatar(user: TestUser) {
  const res = await request(app).get("/v1/avatar").set("Cookie", user.cookie);
  expect(res.status, res.text).toBe(200);
  return avatarResponseSchema.parse(res.body);
}

async function stimulusOf(setIds: string[]) {
  const rows = await prisma.xpEvent.findMany({ where: { source: "workout_set", sourceId: { in: setIds } } });
  return new Map(rows.map((r) => [r.sourceId, Number(r.stimulus)]));
}

describe("Finish writes each set's stimulus", () => {
  it("a hard set is 1, a warm-up 0; the weekly bonus row 0", async () => {
    const user = await player();
    // A first session: the 20 kg set before the working sets is a warm-up (still a little XP).
    const res = await finish(user, "2026-10-05T17:00:00Z", [
      { slug: "barbell-bench-press", sets: [{ reps: 5, weightKg: 20 }, ...bench(3).sets] },
    ]);
    const setIds = res.workout.exercises[0]!.sets.map((s) => s.id);
    expect(res.summary.sets[0]!.tag).toBe("warm_up");
    const stimulus = await stimulusOf(setIds);
    expect(setIds.map((id) => stimulus.get(id))).toEqual([0, 1, 1, 1]);

    await finish(user, "2026-10-07T17:00:00Z", [bench(3)]); // meets the weekly goal of 2
    const bonus = await prisma.xpEvent.findFirstOrThrow({ where: { userId: user.userId, source: "weekly_goal" } });
    expect(Number(bonus.stimulus)).toBe(0);
  });
});

describe("the stimulus CHECK constraint", () => {
  const row = (
    userId: string,
    source: "workout_set" | "weekly_goal" | "streak_milestone" | "dev_grant",
    stimulus: number,
  ) =>
    prisma.xpEvent.create({
      data: {
        userId,
        amount: 10,
        source,
        sourceId: randomUUID(),
        bodyPart: "legs",
        earnedOn: new Date("2026-10-05"),
        stimulus,
      },
    });

  it.each([
    ["a set row above 1", "workout_set", 1.5],
    ["a negative set row", "workout_set", -0.1],
    ["a weekly bonus with stimulus", "weekly_goal", 0.5],
    ["a streak bonus with stimulus", "streak_milestone", 1],
  ] as const)("refuses %s", async (_case, source, stimulus) => {
    const user = await player();
    await expect(row(user.userId, source, stimulus)).rejects.toThrow(/xp_event_stimulus_check/);
  });

  it("accepts set rows from 0 to 1, and leaves other sources open (dev grants; Milestone 7's signed corrections)", async () => {
    const user = await player();
    await expect(row(user.userId, "workout_set", 0)).resolves.toBeDefined();
    await expect(row(user.userId, "workout_set", 1)).resolves.toBeDefined();
    await expect(row(user.userId, "dev_grant", 12)).resolves.toBeDefined();
    await expect(row(user.userId, "dev_grant", -3)).resolves.toBeDefined();
  });
});

describe("the stimulus backfill (the migration's own SQL)", () => {
  function backfillStatements(): string[] {
    const migrations = join(dirname(fileURLToPath(import.meta.url)), "../../../prisma/migrations");
    const folder = readdirSync(migrations).find((name) => name.endsWith("_avatar_development"));
    if (!folder) throw new Error("avatar_development migration not found");
    const sql = readFileSync(join(migrations, folder, "migration.sql"), "utf8");
    const section = sql.slice(sql.indexOf("-- backfill:start"), sql.indexOf("-- backfill:end"));
    return section
      .replace(/--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  it("sets each set row from its stored tag, and leaves bonus rows at 0", async () => {
    const user = await player();
    const res = await finish(user, "2026-10-05T17:00:00Z", [
      { slug: "barbell-bench-press", sets: [{ reps: 5, weightKg: 20 }, ...bench(3).sets] },
    ]);
    await finish(user, "2026-10-07T17:00:00Z", [bench(3)]);
    const setIds = res.workout.exercises[0]!.sets.map((s) => s.id);
    // One set as each other tag the backfill knows, written straight into the stored set.
    await prisma.workoutSet.update({ where: { id: setIds[1]! }, data: { xpTag: "easy_set" } });
    await prisma.workoutSet.update({ where: { id: setIds[2]! }, data: { xpTag: "above_history" } });

    // As before the migration: no stimulus anywhere.
    await prisma.xpEvent.updateMany({ where: { userId: user.userId }, data: { stimulus: 0 } });
    for (const statement of backfillStatements()) await prisma.$executeRawUnsafe(statement);

    const stimulus = await stimulusOf(setIds);
    expect(setIds.map((id) => stimulus.get(id))).toEqual([0, 0.4, 1, 1]); // warm-up, easy, above history, no tag
    const bonus = await prisma.xpEvent.findFirstOrThrow({ where: { userId: user.userId, source: "weekly_goal" } });
    expect(Number(bonus.stimulus)).toBe(0);
  });
});

describe("GET /v1/avatar", () => {
  it("is 404 without a character", async () => {
    const user = await signUpUser();
    const res = await request(app).get("/v1/avatar").set("Cookie", user.cookie);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("ProfileNotFound");
  });

  it("a new player: the Rookie stage, every stage, development 0 everywhere, stamina 0", async () => {
    const user = await player();
    const body = await avatar(user);
    expect(body.stage?.key).toBe("rookie");
    expect(body.stages.map((s) => s.key)).toEqual(["rookie", "regular", "athlete", "champion", "legend"]);
    expect(body.development).toEqual(ZEROS);
    expect(body.stamina).toBe(0);
    expect(Object.values(body.lastTrainedOn)).toEqual(BODY_PARTS.map(() => null));
  });

  it("a workout grows only the parts it trained, at once", async () => {
    const user = await player();
    await finish(user, "2026-10-05T17:00:00Z", [bench(4)]);
    const body = await avatar(user);
    expect(body.development.chest).toBeGreaterThan(0);
    expect({ ...body.development, chest: 0 }).toEqual(ZEROS);
    expect(body.lastTrainedOn.chest).toBe("2026-10-05");
  });

  it("untrained parts stay at 0 whatever the level: XP alone (a level-20 dev grant) grows nothing", async () => {
    const user = await player();
    await prisma.xpEvent.create({
      data: {
        userId: user.userId,
        amount: xpForLevel(20),
        source: "dev_grant",
        sourceId: randomUUID(),
        earnedOn: new Date("2026-10-05"),
      },
    });
    await prisma.profile.update({ where: { userId: user.userId }, data: { totalXp: xpForLevel(20) } });
    const body = await avatar(user);
    expect(body.stage?.key).toBe("legend");
    expect(body.stage?.extras).toEqual(["wristbands", "outfit", "headband", "cape"]);
    expect(body.development).toEqual(ZEROS);
  });

  it("a part untrained for months shrinks: 8 months after its last training it's below half", async () => {
    const user = await player("2026-01-05T07:00:00Z");
    // 30 weeks of legs, 20 hard sets a week (one dev-grant row a week: the source is open).
    const rows = Array.from({ length: 30 }, (_, w) => ({
      userId: user.userId,
      amount: 0,
      source: "dev_grant" as const,
      sourceId: randomUUID(),
      bodyPart: "legs" as const,
      earnedOn: new Date(Date.parse("2026-01-05T00:00:00Z") + w * 7 * DAY),
      stimulus: 20,
    }));
    await prisma.xpEvent.createMany({ data: rows });
    const lastTraining = Date.parse("2026-01-05T00:00:00Z") + 29 * 7 * DAY;

    setNow(new Date(lastTraining + 12 * 3_600_000).toISOString());
    const trained = (await avatar(user)).development.legs;
    setNow(new Date(lastTraining + 243 * DAY).toISOString()); // about 8 months later
    const later = (await avatar(user)).development.legs;
    expect(trained).toBeGreaterThan(0.5);
    expect(later).toBeLessThan(trained / 2);
    expect(later).toBeGreaterThan(0); // not back to the start before a year
  });
});

describe("the Finish summary's avatar before/after", () => {
  it("shows the change, and a repeated Finish and the summary endpoint return exactly the same", async () => {
    const user = await player();
    const clientId = randomUUID();
    const first = await finish(user, "2026-10-05T17:00:00Z", [bench(4)], { clientId });
    expect(first.summary.avatar!.before).toEqual(ZEROS);
    expect(first.summary.avatar!.after.chest).toBeGreaterThan(0);

    // Later things happen (another workout), then the phone resends the first Finish.
    await finish(user, "2026-10-07T17:00:00Z", [bench(4)]);
    const repeat = await finish(user, "2026-10-05T17:00:00Z", [bench(4)], {
      clientId,
      syncedAt: "2026-10-08T09:00:00Z",
    });
    expect(repeat.summary.avatar).toEqual(first.summary.avatar);
    const read = await request(app).get(`/v1/workouts/${first.workout.id}/summary`).set("Cookie", user.cookie);
    expect(finishWorkoutResponseSchema.parse(read.body).summary.avatar).toEqual(first.summary.avatar);
  });

  it("a late sync: a day-1 workout synced after a day-3 workout is evaluated at day 1, repeats identically, and leaves the day-3 summary unchanged", async () => {
    const user = await player();
    // Day 3's workout reaches the server first.
    const day3 = await finish(user, "2026-10-07T17:00:00Z", [bench(4)]);
    const day3Summary = async () =>
      finishWorkoutResponseSchema.parse(
        (await request(app).get(`/v1/workouts/${day3.workout.id}/summary`).set("Cookie", user.cookie)).body,
      ).summary.avatar;
    const day3Before = await day3Summary();

    // Day 1's workout was logged offline and syncs on day 4.
    const clientId = randomUUID();
    const day1 = await finish(user, "2026-10-05T17:00:00Z", [bench(4)], { clientId, syncedAt: "2026-10-08T09:00:00Z" });

    // Evaluated at day 1: day 3's rows are later-dated, so "before" is the start.
    expect(day1.summary.avatar!.before).toEqual(ZEROS);
    // And "after" is day 1 alone: what the same workout gives a fresh player on day 1.
    const fresh = await player();
    const alone = await finish(fresh, "2026-10-05T17:00:00Z", [bench(4)]);
    expect(day1.summary.avatar!.after).toEqual(alone.summary.avatar!.after);

    // It repeats identically, and day 3's summary didn't move.
    const repeat = await finish(user, "2026-10-05T17:00:00Z", [bench(4)], {
      clientId,
      syncedAt: "2026-10-09T09:00:00Z",
    });
    expect(repeat.summary.avatar).toEqual(day1.summary.avatar);
    expect(await day3Summary()).toEqual(day3Before);

    // Today's development does include both workouts.
    setNow("2026-10-09T09:00:00Z");
    expect((await avatar(user)).development.chest).toBeGreaterThan(day3Before!.after.chest);
  });
});
