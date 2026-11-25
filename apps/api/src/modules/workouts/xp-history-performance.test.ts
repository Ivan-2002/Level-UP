import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { BodyPart, FinishWorkoutInput } from "@levelup/shared";
import { prisma } from "../../lib/prisma.js";
import { app, seedExercises, signUpPlayer, type TestUser } from "../../test/helpers.js";

// The XP history (12-week best, jump baseline) is worked out from the player's WHOLE
// history on every Finish and every GET /exercises/xp-history (decision log, Phase 3):
// no stored copy to keep in step. That cost grows with history, so this test seeds two
// years of a dedicated player's training and holds both requests to a time budget.
//
// The budget is a tripwire, not a promise about production latency. Measured on a laptop
// with Docker Postgres (2026-11-17): xp-history 58 ms, Finish 67 ms, exercise list 3 ms.
// About 6x that leaves room for a slower CI machine (often 2-3x) while still failing on
// a real slowdown: an accidental query per session or a quadratic loop costs far more
// than 6x. The cost grows linearly with history (about 30 ms a year for this player).
// If it is exceeded for real, the planned next step is a stored row per player and
// exercise (best, baseline), updated at Finish (docs/ARCHITECTURE.md).
//
// Milestone 6a adds the avatar: GET /v1/avatar walks every body part's dated stimulus
// (one ledger row per set: about 10,000 here), and Finish's summary walks it twice (before
// and after). Same budget; past it, the planned step is a stored row per player and part.

const BUDGET_MS = { xpHistory: 400, finish: 400, exerciseList: 150, avatar: 400 } as const;

const WEEKS = 104;
const SESSIONS_PER_WEEK = 4;
const EXERCISES = 20;
const EXERCISES_PER_SESSION = 6;
const SETS_PER_EXERCISE = 4;

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await seedExercises();
});

/**
 * Two years of 4 sessions a week, rotating through 20 exercises (6 a session, 4 sets each,
 * slowly getting heavier), plus a weekly bodyweight entry. Bulk inserts, straight into the
 * tables: 416 Finishes through the API would make the test take minutes.
 */
async function seedTwoYears(user: TestUser, exercises: { id: string; bodyPart: BodyPart }[]) {
  const exerciseIds = exercises.map((e) => e.id);
  const start = Date.now() - WEEKS * 7 * DAY;
  const workouts: { id: string; userId: string; clientId: string; startedAt: Date; finishedAt: Date }[] = [];
  const workoutExercises: { id: string; workoutId: string; exerciseId: string; order: number }[] = [];
  const sets: { id: string; workoutExerciseId: string; setOrder: number; reps: number; weightKg: number }[] = [];
  // The ledger Finish would have written: one row per set, with its body part, day and stimulus.
  const xpEvents: {
    userId: string;
    amount: number;
    source: "workout_set";
    sourceId: string;
    bodyPart: BodyPart;
    earnedOn: Date;
    stimulus: number;
  }[] = [];

  for (let n = 0; n < WEEKS * SESSIONS_PER_WEEK; n++) {
    const startedAt = new Date(start + Math.floor(n / SESSIONS_PER_WEEK) * 7 * DAY + (n % SESSIONS_PER_WEEK) * 2 * DAY);
    const workoutId = randomUUID();
    workouts.push({
      id: workoutId,
      userId: user.userId,
      clientId: randomUUID(),
      startedAt,
      finishedAt: new Date(startedAt.getTime() + 3600_000),
    });
    for (let order = 0; order < EXERCISES_PER_SESSION; order++) {
      const id = randomUUID();
      workoutExercises.push({
        id,
        workoutId,
        exerciseId: exerciseIds[(n * EXERCISES_PER_SESSION + order) % EXERCISES]!,
        order,
      });
      const weightKg = 20 + Math.floor(n / 20) * 0.5; // +0.5 kg every 5 weeks: plausible on any equipment
      const exercise = exercises[(n * EXERCISES_PER_SESSION + order) % EXERCISES]!;
      for (let setOrder = 0; setOrder < SETS_PER_EXERCISE; setOrder++) {
        const setId = randomUUID();
        sets.push({ id: setId, workoutExerciseId: id, setOrder, reps: 8, weightKg });
        xpEvents.push({
          userId: user.userId,
          amount: 50,
          source: "workout_set",
          sourceId: setId,
          bodyPart: exercise.bodyPart,
          earnedOn: new Date(startedAt.toISOString().slice(0, 10)),
          stimulus: 1,
        });
      }
    }
  }

  await prisma.workout.createMany({ data: workouts });
  await prisma.workoutExercise.createMany({ data: workoutExercises });
  await prisma.workoutSet.createMany({ data: sets });
  await prisma.xpEvent.createMany({ data: xpEvents });
  const bodyweights = Array.from({ length: WEEKS }, (_, w) => ({
    userId: user.userId,
    kg: 80 + w * 0.02,
    measuredOn: new Date(new Date(start + w * 7 * DAY).toISOString().slice(0, 10)),
    receivedAt: new Date(start + w * 7 * DAY),
  }));
  await prisma.bodyweightEntry.createMany({ data: bodyweights });
  await prisma.bodyweightReceipt.createMany({ data: bodyweights });
  return { workouts: workouts.length, sets: sets.length, xpEvents: xpEvents.length };
}

/** The fastest of three runs (after one warm-up), so one slow moment doesn't fail the test. */
async function bestOf3(run: () => Promise<void>): Promise<number> {
  await run();
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await run();
    times.push(performance.now() - t);
  }
  return Math.min(...times);
}

describe("XP history cost after two years of training", () => {
  it(
    "keeps GET /exercises/xp-history, GET /exercises, GET /avatar and Finish within budget",
    { timeout: 60_000 },
    async () => {
      const user = await signUpPlayer({ bodyweightKg: 80 });
      const exercises = await prisma.exercise.findMany({
        where: { repsUnit: "reps", isCustom: false },
        orderBy: { slug: "asc" },
        take: EXERCISES,
        select: { id: true, bodyPart: true },
      });
      const exerciseIds = exercises.map((e) => e.id);
      expect(exerciseIds).toHaveLength(EXERCISES);
      const seeded = await seedTwoYears(user, exercises);
      const setCount = 416 * EXERCISES_PER_SESSION * SETS_PER_EXERCISE;
      expect(seeded).toEqual({ workouts: 416, sets: setCount, xpEvents: setCount });

      const xpHistoryMs = await bestOf3(async () => {
        const res = await request(app).get("/v1/exercises/xp-history").set("Cookie", user.cookie);
        expect(res.body.items).toHaveLength(EXERCISES);
      });
      const avatarMs = await bestOf3(async () => {
        const res = await request(app).get("/v1/avatar").set("Cookie", user.cookie);
        expect(res.status).toBe(200);
        expect(Object.values(res.body.development).some((v) => (v as number) > 0)).toBe(true);
      });
      const exerciseListMs = await bestOf3(async () => {
        expect((await request(app).get("/v1/exercises").set("Cookie", user.cookie)).status).toBe(200);
      });
      // A normal session: 6 exercises the player has done ~125 times each.
      const finishMs = await bestOf3(async () => {
        const startedAt = Date.now() - 2 * 3600_000;
        const body: FinishWorkoutInput = {
          clientId: randomUUID(),
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date(startedAt + 3600_000).toISOString(),
          exercises: exerciseIds
            .slice(0, EXERCISES_PER_SESSION)
            .map((exerciseId) => ({ exerciseId, sets: Array.from({ length: 4 }, () => ({ reps: 8, weightKg: 42 })) })),
        };
        expect((await request(app).post("/v1/workouts").set("Cookie", user.cookie).send(body)).status).toBe(201);
      });

      console.info(
        `XP history after ${seeded.workouts} workouts / ${seeded.sets} sets: ` +
          `GET /exercises/xp-history ${xpHistoryMs.toFixed(0)} ms, GET /exercises ${exerciseListMs.toFixed(0)} ms, ` +
          `GET /avatar ${avatarMs.toFixed(0)} ms, Finish ${finishMs.toFixed(0)} ms`,
      );
      expect(xpHistoryMs).toBeLessThan(BUDGET_MS.xpHistory);
      expect(exerciseListMs).toBeLessThan(BUDGET_MS.exerciseList);
      expect(finishMs).toBeLessThan(BUDGET_MS.finish);
      expect(avatarMs).toBeLessThan(BUDGET_MS.avatar);
    },
  );
});
