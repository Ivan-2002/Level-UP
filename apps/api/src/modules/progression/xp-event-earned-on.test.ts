import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@levelup/shared";
import { setNow } from "../../lib/clock.js";
import { prisma } from "../../lib/prisma.js";
import { app, seedExercises, signUpPlayer, type TestUser } from "../../test/helpers.js";

// xp_event.earned_on: the player's local calendar day each XP gain belongs to.
// - New rows: Finish writes it (set XP: the workout's local start day; a bonus: the local
//   start day of the workout that met the goal, else the week's Monday).
// - Existing rows: the migration's backfill SQL. These tests run THAT SQL (read from the
//   migration file) and compare it with the shared localDate function, an independent
//   implementation, across zones with different offsets.

let ids: Record<string, string>;
beforeEach(async () => {
  ids = await seedExercises();
});
afterEach(() => setNow(null));

const day = (d: Date) => d.toISOString().slice(0, 10);

/** A player whose account was created at `signedUpAt` (a Monday, so week 1 isn't a warm-up). */
async function player(timeZone: string, signedUpAt: string): Promise<TestUser & { timeZone: string }> {
  setNow(signedUpAt);
  return { ...(await signUpPlayer({ timeZone })), timeZone };
}

/** Finishes a one-hour, 3-set workout that started at `startedAt` (an ISO instant). */
async function train(user: TestUser, startedAt: string): Promise<string> {
  const start = new Date(startedAt);
  const end = new Date(start.getTime() + 3_600_000);
  setNow(end);
  const res = await request(app)
    .post("/v1/workouts")
    .set("Cookie", user.cookie)
    .send({
      clientId: randomUUID(),
      startedAt: start.toISOString(),
      finishedAt: end.toISOString(),
      exercises: [
        { exerciseId: ids["barbell-bench-press"], sets: Array.from({ length: 3 }, () => ({ reps: 8, weightKg: 60 })) },
      ],
    });
  expect(res.status, res.text).toBe(201);
  return res.body.workout.id as string;
}

/** Every ledger row of the player, with the local day it SHOULD have (worked out in TypeScript). */
async function expectedDays(user: TestUser & { timeZone: string }) {
  const events = await prisma.xpEvent.findMany({ where: { userId: user.userId }, orderBy: { createdAt: "asc" } });
  return Promise.all(
    events.map(async (e) => {
      if (e.source === "workout_set") {
        const set = await prisma.workoutSet.findUniqueOrThrow({
          where: { id: e.sourceId },
          include: { workoutExercise: { include: { workout: true } } },
        });
        return {
          id: e.id,
          actual: day(e.earnedOn),
          expected: localDate(set.workoutExercise.workout.startedAt, user.timeZone),
        };
      }
      const week = await prisma.weeklyGoal.findUniqueOrThrow({
        where: { id: e.sourceId },
        include: { metByWorkout: true },
      });
      const expected = week.metByWorkout ? localDate(week.metByWorkout.startedAt, user.timeZone) : day(week.weekStart);
      return { id: e.id, actual: day(e.earnedOn), expected };
    }),
  );
}

/** The backfill statements from the migration, between its "backfill:start" and "backfill:end" markers. */
function backfillStatements(): string[] {
  const migrations = join(dirname(fileURLToPath(import.meta.url)), "../../../prisma/migrations");
  const folder = readdirSync(migrations).find((name) => name.endsWith("_xp_event_earned_on"));
  if (!folder) throw new Error("earned_on migration not found");
  const sql = readFileSync(join(migrations, folder, "migration.sql"), "utf8");
  const section = sql.slice(sql.indexOf("-- backfill:start"), sql.indexOf("-- backfill:end"));
  return section
    .replace(/--.*$/gm, "") // comments first: they may contain ";"
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

describe("Finish writes earned_on", () => {
  it("dates set XP by the LOCAL day the workout started, not the UTC day", async () => {
    const user = await player("Africa/Johannesburg", "2026-10-05T06:00:00Z"); // Monday 08:00 in Johannesburg
    // Tuesday 00:30 in Johannesburg is still Monday 22:30 in UTC.
    await train(user, "2026-10-05T22:30:00Z");

    const days = await expectedDays(user);
    expect(days.map((d) => d.actual)).toEqual(["2026-10-06", "2026-10-06", "2026-10-06"]);
    expect(days.every((d) => d.actual === d.expected)).toBe(true);
  });

  it("dates a bonus by the local start day of the workout that met the goal", async () => {
    const user = await player("Africa/Johannesburg", "2026-10-05T06:00:00Z");
    await train(user, "2026-10-06T05:00:00Z"); // Tuesday
    await train(user, "2026-10-07T21:30:00Z"); // Wednesday 23:30 local: meets the target of 2

    const bonus = await prisma.xpEvent.findFirstOrThrow({ where: { userId: user.userId, source: "weekly_goal" } });
    expect(day(bonus.earnedOn)).toBe("2026-10-07");
  });
});

describe("the earned_on backfill (the migration's own SQL)", () => {
  it("matches the shared localDate across zones and offsets, for set XP and bonuses", async () => {
    const jhb = await player("Africa/Johannesburg", "2026-10-05T06:00:00Z"); // UTC+2
    await train(jhb, "2026-10-06T21:30:00Z"); // Tuesday 23:30 local, same UTC day
    await train(jhb, "2026-10-07T22:30:00Z"); // Thursday 00:30 local, Wednesday in UTC; meets the goal

    const newYork = await player("America/New_York", "2026-10-05T13:00:00Z"); // UTC-4 in October
    await train(newYork, "2026-10-07T01:00:00Z"); // Tuesday 21:00 local, Wednesday in UTC

    const kolkata = await player("Asia/Kolkata", "2026-10-05T03:00:00Z"); // UTC+5:30
    await train(kolkata, "2026-10-06T18:45:00Z"); // Wednesday 00:15 local, Tuesday in UTC

    // A bonus with no recorded workout (a recount found the week met): the week's Monday.
    const week = await prisma.weeklyGoal.create({
      data: {
        userId: kolkata.userId,
        weekStart: new Date("2026-09-28T00:00:00Z"),
        target: 2,
        daysTrained: 2,
        met: true,
        closedAt: new Date(),
      },
    });
    await prisma.xpEvent.create({
      data: {
        userId: kolkata.userId,
        amount: 400,
        source: "weekly_goal",
        sourceId: week.id,
        earnedOn: new Date("2026-10-01T00:00:00Z"),
      },
    });

    // Wipe the dates, then run the migration's backfill on them.
    await prisma.xpEvent.updateMany({ data: { earnedOn: new Date("2000-01-01T00:00:00Z") } });
    for (const statement of backfillStatements()) await prisma.$executeRawUnsafe(statement);

    for (const user of [jhb, newYork, kolkata]) {
      const days = await expectedDays(user);
      expect(days.length).toBeGreaterThan(0);
      for (const d of days) expect(d.actual, `${user.timeZone} row ${d.id}`).toBe(d.expected);
    }
    // Spot checks against hand-worked days, so a bug shared by both sides would show too.
    expect((await expectedDays(jhb)).map((d) => d.actual)).toEqual([
      ...Array(3).fill("2026-10-06"),
      ...Array(3).fill("2026-10-08"),
      "2026-10-08",
    ]);
    expect(new Set((await expectedDays(newYork)).map((d) => d.actual))).toEqual(new Set(["2026-10-06"]));
    expect((await expectedDays(kolkata)).map((d) => d.actual)).toEqual([...Array(3).fill("2026-10-07"), "2026-09-28"]);
  });
});
