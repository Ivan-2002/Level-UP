import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyDailyCap,
  DAILY_XP_CAP,
  epleyOneRepMax,
  finishWorkoutResponseSchema,
  JUMP_CAP,
  jumpCappedXp,
  MAX_XP_SETS_PER_EXERCISE,
  scoreSessionSets,
  XP_MAX_WORKOUT_AGE_DAYS,
  setXp,
  type FinishWorkoutInput,
  type ScoringExercise,
} from "@levelup/shared";
import { prisma } from "../../lib/prisma.js";
import { app, seedExercises, signUpPlayer, type TestUser } from "../../test/helpers.js";

// Finish runs the shared scoring (scoreSessionSets) with the player's history, and stores
// what it decided on each set. Expected numbers come from the shared functions: these
// tests check that the SERVER plays the rules, not what the rules are worth (the shared
// package and the simulation test that).

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();

// The catalog's tuning, as scoring sees it (exercise-catalog.ts).
const BENCH: ScoringExercise = { equipment: "barbell", mechanic: "compound", repsUnit: "reps", loadFactor: 1.25, bodyweightRatio: 0 };
const SQUAT: ScoringExercise = { ...BENCH, loadFactor: 1 };
const DEADLIFT: ScoringExercise = { ...BENCH, loadFactor: 1.2 };

let ids: Record<string, string>;

beforeEach(async () => {
  ids = await seedExercises();
});

type SetInput = { reps: number; weightKg: number };
const times = <T,>(n: number, item: T): T[] => Array.from({ length: n }, () => item);

/** A one-hour workout that started `daysAgo` days ago. */
function workout(daysAgo: number, exercises: [slug: string, sets: SetInput[]][]): FinishWorkoutInput {
  return workoutAt(Date.now() - daysAgo * DAY - 2 * 60 * MINUTE, exercises);
}

/** Noon UTC, `daysAgo` days ago: a fixed time of day, so a test can't straddle midnight. */
const noonDaysAgo = (daysAgo: number) => Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - daysAgo, 12);
const dateOf = (ms: number) => iso(ms).slice(0, 10);

function workoutAt(startedAt: number, exercises: [slug: string, sets: SetInput[]][]): FinishWorkoutInput {
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
  return finishWorkoutResponseSchema.parse(res.body);
}

/** Every stored set of a workout, in the order logged, with its XP from the ledger. */
async function storedSets(workoutId: string) {
  const sets = await prisma.workoutSet.findMany({
    where: { workoutExercise: { workoutId } },
    orderBy: [{ workoutExercise: { order: "asc" } }, { setOrder: "asc" }],
  });
  const events = await prisma.xpEvent.findMany({ where: { sourceId: { in: sets.map((s) => s.id) } } });
  return sets.map((s) => ({
    xp: events.find((e) => e.sourceId === s.id)?.amount ?? 0,
    isFlagged: s.isFlagged,
    flagReason: s.flagReason,
    xpTag: s.xpTag,
  }));
}

describe("plausibility at Finish", () => {
  it("saves an implausible set flagged, with no XP and no PR", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75 });
    await finish(user, workout(2, [["barbell-bench-press", [{ reps: 8, weightKg: 60 }]]]));

    // 400 kg is above the barbell compound limit (350): a typo for 40, say.
    const { workout: saved, summary } = await finish(user, workout(1, [["barbell-bench-press", [{ reps: 8, weightKg: 60 }, { reps: 8, weightKg: 400 }]]]));

    expect(await storedSets(saved.id)).toEqual([
      { xp: setXp({ reps: 8, weightKg: 60 }, 75, BENCH), isFlagged: false, flagReason: null, xpTag: null },
      { xp: 0, isFlagged: true, flagReason: "weight_above_range", xpTag: "check_set" },
    ]);
    expect(summary.prs).toEqual([]);
  });
});

describe("the jump cap at Finish", () => {
  it("caps a set far above the player's earlier best at the +25% line, and stores why", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75 });
    await finish(user, workout(2, [["barbell-bench-press", [{ reps: 8, weightKg: 60 }]]]));

    const { workout: saved } = await finish(user, workout(1, [["barbell-bench-press", [{ reps: 8, weightKg: 100 }]]]));

    // Baseline: 60 x 8 (estimated 1RM 76 kg); the line is 95 kg; 100 x 8 is 126.7 kg.
    const line = epleyOneRepMax(60, 8) * (1 + JUMP_CAP.maxJump);
    const capped = jumpCappedXp(setXp({ reps: 8, weightKg: 100 }, 75, BENCH), line / epleyOneRepMax(100, 8));
    expect(await storedSets(saved.id)).toEqual([{ xp: capped, isFlagged: false, flagReason: "above_history", xpTag: "above_history" }]);
  });

  it("compares with workouts that STARTED earlier, including ones synced after it", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75 });
    await finish(user, workout(1, [["barbell-bench-press", [{ reps: 8, weightKg: 100 }]]]));

    // An older, lighter workout arriving late: it has nothing before it, so nothing to cap...
    const late = await finish(user, workout(3, [["barbell-bench-press", [{ reps: 8, weightKg: 60 }]]]));
    // ...but it is now history for anything that starts after it.
    const next = await finish(user, workout(0, [["barbell-bench-press", [{ reps: 8, weightKg: 100 }]]]));

    expect((await storedSets(late.workout.id))[0]!.flagReason).toBeNull();
    // Baseline after 60 x 8 then 100 x 8: the second is capped at the line, so the baseline is the line.
    expect((await storedSets(next.workout.id))[0]!.flagReason).toBe("above_history");
  });
});

describe("the 10-set limit and tags at Finish", () => {
  it(`gives no XP beyond ${MAX_XP_SETS_PER_EXERCISE} sets of an exercise, counting a superset's two halves together`, async () => {
    const user = await signUpPlayer({ bodyweightKg: 75 });

    const { workout: saved } = await finish(
      user,
      workout(0, [
        ["barbell-bench-press", times(6, { reps: 8, weightKg: 60 })],
        ["lateral-raise", times(3, { reps: 12, weightKg: 10 })],
        ["barbell-bench-press", times(6, { reps: 8, weightKg: 60 })],
      ]),
    );

    const bench = (await storedSets(saved.id)).filter((_, i) => i < 6 || i >= 9);
    expect(bench.filter((s) => s.xpTag === "beyond_set_limit")).toHaveLength(2);
    expect(bench.slice(-2)).toEqual(times(2, { xp: 0, isFlagged: false, flagReason: null, xpTag: "beyond_set_limit" }));
    expect(await prisma.xpEvent.count({ where: { userId: user.userId } })).toBe(10 + 3);
  });

  it("stores the shared scoring's tags and XP: warm-ups first, then working sets", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75 });
    const sets = [{ reps: 10, weightKg: 20 }, { reps: 5, weightKg: 40 }, ...times(3, { reps: 8, weightKg: 60 })];

    const { workout: saved } = await finish(user, workout(0, [["barbell-bench-press", sets]]));

    const expected = scoreSessionSets({
      sets: sets.map((s) => ({ exerciseId: "bench", ...s })),
      exercises: new Map([["bench", BENCH]]),
      history: new Map(),
      bodyweight: { xp: 75, typed: 75 },
    });
    expect(expected.sets.map((s) => s.tag)).toEqual(["warm_up", "warm_up", null, null, null]); // the case under test
    expect(await storedSets(saved.id)).toEqual(
      expected.sets.map((s) => ({ xp: s.xp, isFlagged: s.isFlagged, flagReason: s.flagReason, xpTag: s.tag })),
    );
  });
});

describe("the daily cap at Finish", () => {
  // 10 x 10 at 100 kg on one lift: every set at the session best (full effort), 10 sets so
  // none is beyond the limit. Identical sets each time, so history doesn't change their XP.
  const HEAVY = times(10, { reps: 10, weightKg: 100 });
  const benchSetXp = setXp({ reps: 10, weightKg: 100 }, 75, BENCH);
  const ledgerOf = async (workoutId: string) => (await storedSets(workoutId)).map((s) => s.xp);
  const heldBackOf = (workoutId: string) =>
    prisma.workout.findUniqueOrThrow({ where: { id: workoutId }, select: { xpHeldBack: true, xpHeldBackReason: true } });

  it("counts a late-synced workout against the day it STARTED, with that day's earlier XP", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75, timeZone: "UTC" });
    const twoDaysAgo = noonDaysAgo(2);
    await finish(user, workoutAt(twoDaysAgo, [["barbell-bench-press", HEAVY]]));
    await finish(user, workoutAt(twoDaysAgo + 60 * MINUTE, [["barbell-bench-press", HEAVY]]));
    await finish(user, workout(0, [["barbell-bench-press", HEAVY]])); // today: a different day

    // Trained two days ago, synced now: it shares a day with the first two, not with today's.
    const late = await finish(user, workoutAt(twoDaysAgo + 120 * MINUTE, [["barbell-bench-press", HEAVY]]));

    const expected = applyDailyCap(20 * benchSetXp, times(10, benchSetXp));
    expect(20 * benchSetXp + 10 * benchSetXp).toBeGreaterThan(DAILY_XP_CAP.limit); // the case under test
    expect(await ledgerOf(late.workout.id)).toEqual(expected.awarded);
    expect(await heldBackOf(late.workout.id)).toEqual({ xpHeldBack: expected.heldBack, xpHeldBackReason: "daily_cap" });
    const days = await prisma.xpEvent.groupBy({ by: ["earnedOn"], where: { userId: user.userId }, _count: true });
    expect(days.find((d) => dateOf(d.earnedOn.getTime()) === dateOf(twoDaysAgo))?._count).toBe(30);
  });

  it("holds a single big workout to the cap, and the cached total matches the ledger", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75, timeZone: "UTC" });
    const big = workoutAt(noonDaysAgo(1), [
      ["barbell-bench-press", HEAVY],
      ["barbell-back-squat", HEAVY],
      ["deadlift", HEAVY],
    ]);

    const { workout: saved } = await finish(user, big);

    const raw = [BENCH, SQUAT, DEADLIFT].flatMap((tuning) => times(10, setXp({ reps: 10, weightKg: 100 }, 75, tuning)));
    const expected = applyDailyCap(0, raw);
    expect(await ledgerOf(saved.id)).toEqual(expected.awarded);
    expect(await heldBackOf(saved.id)).toEqual({ xpHeldBack: expected.heldBack, xpHeldBackReason: "daily_cap" });
    const total = expected.awarded.reduce((a, b) => a + b, 0);
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } })).totalXp).toBe(total);
  });

  it("can't be beaten by sending two Finishes at the same moment (the profile lock)", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75, timeZone: "UTC" });
    const startedAt = noonDaysAgo(1);
    const day = (): FinishWorkoutInput => workoutAt(startedAt, [["barbell-bench-press", HEAVY], ["barbell-back-squat", HEAVY]]);

    const responses = await Promise.all([day(), day()].map((body) => request(app).post("/v1/workouts").set("Cookie", user.cookie).send(body)));

    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    // One after the other: the second one counts the first one's XP.
    const raw = [BENCH, SQUAT].flatMap((tuning) => times(10, setXp({ reps: 10, weightKg: 100 }, 75, tuning)));
    const first = applyDailyCap(0, raw);
    const second = applyDailyCap(first.awarded.reduce((a, b) => a + b, 0), raw);
    const dayTotal = [...first.awarded, ...second.awarded].reduce((a, b) => a + b, 0);
    expect(2 * raw.reduce((a, b) => a + b, 0)).toBeGreaterThan(DAILY_XP_CAP.limit); // the case under test
    const recorded = await prisma.xpEvent.aggregate({ where: { userId: user.userId }, _sum: { amount: true } });
    expect(recorded._sum.amount).toBe(dayTotal);
    const workouts = await prisma.workout.findMany({ where: { userId: user.userId }, select: { xpHeldBack: true } });
    expect(workouts.map((w) => w.xpHeldBack).sort((a, b) => a - b)).toEqual([first.heldBack, second.heldBack].sort((a, b) => a - b));
  });

  it("returns the same held-back XP on a repeated Finish, and records nothing more", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75, timeZone: "UTC" });
    const big = workoutAt(noonDaysAgo(1), [["barbell-bench-press", HEAVY], ["barbell-back-squat", HEAVY], ["deadlift", HEAVY]]);

    const first = await finish(user, big);
    const before = await heldBackOf(first.workout.id);
    const repeat = await request(app).post("/v1/workouts").set("Cookie", user.cookie).send(big);

    expect(repeat.status).toBe(200);
    expect(repeat.body).toEqual(first);
    expect(await heldBackOf(first.workout.id)).toEqual(before);
    expect(await prisma.xpEvent.count({ where: { userId: user.userId } })).toBe(30);
  });
});

describe(`the ${XP_MAX_WORKOUT_AGE_DAYS}-day rule at Finish`, () => {
  it("saves a workout that started more than 14 days before it arrived, with no set XP", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75 });
    const sets = times(3, { reps: 8, weightKg: 60 });

    const { workout: saved } = await finish(user, workout(XP_MAX_WORKOUT_AGE_DAYS + 1, [["barbell-bench-press", sets]]));

    expect(await prisma.xpEvent.count({ where: { userId: user.userId } })).toBe(0);
    expect(await prisma.workout.findUniqueOrThrow({ where: { id: saved.id }, select: { xpHeldBack: true, xpHeldBackReason: true } })).toEqual({
      xpHeldBack: 3 * setXp({ reps: 8, weightKg: 60 }, 75, BENCH),
      xpHeldBackReason: "too_old",
    });
    // Still history: the next workout's records compare with it (60 kg x 8: estimated 1RM 76 kg).
    const next = await finish(user, workout(0, [["barbell-bench-press", [{ reps: 8, weightKg: 62.5 }]]]));
    expect(next.summary.prs).toEqual([expect.objectContaining({ kind: "e1rm", previousValue: 76 })]);
  });

  it("still awards XP to a workout that started just under 14 days ago", async () => {
    const user = await signUpPlayer({ bodyweightKg: 75 });

    const { summary } = await finish(user, workoutAt(Date.now() - XP_MAX_WORKOUT_AGE_DAYS * DAY + 10 * MINUTE, [["barbell-bench-press", [{ reps: 8, weightKg: 60 }]]]));

    expect(summary.xp.sets).toBe(setXp({ reps: 8, weightKg: 60 }, 75, BENCH));
  });
});
