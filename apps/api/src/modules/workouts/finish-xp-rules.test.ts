import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  epleyOneRepMax,
  finishWorkoutResponseSchema,
  JUMP_CAP,
  jumpCappedXp,
  MAX_XP_SETS_PER_EXERCISE,
  scoreSessionSets,
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

// The catalog's bench press, as scoring sees it (exercise-catalog.ts).
const BENCH: ScoringExercise = { equipment: "barbell", mechanic: "compound", repsUnit: "reps", loadFactor: 1.25, bodyweightRatio: 0 };

let ids: Record<string, string>;

beforeEach(async () => {
  ids = await seedExercises();
});

type SetInput = { reps: number; weightKg: number };
const times = (n: number, set: SetInput) => Array.from({ length: n }, () => set);

/** A one-hour workout that started `daysAgo` days ago. */
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
    expect(bench.slice(-2)).toEqual(times(2, { xp: 0, isFlagged: false, flagReason: null, xpTag: "beyond_set_limit" } as never));
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
