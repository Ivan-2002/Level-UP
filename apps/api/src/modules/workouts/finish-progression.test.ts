import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { finishWorkoutResponseSchema, fromInputWeight, toDisplayWeight, type FinishWorkoutInput } from "@levelup/shared";
import { prisma } from "../../lib/prisma.js";
import { app, seedExercises, signUpPlayer, type TestUser } from "../../test/helpers.js";

// Finish = save + XP ledger + rest preferences + routine link, in one transaction,
// answered with a summary that is recalculated identically on every read.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();
const isoDate = (ms: number) => iso(ms).slice(0, 10);

let ids: Record<string, string>;

beforeEach(async () => {
  ids = await seedExercises();
});

type SetInput = { reps: number; weightKg: number };

/** A one-hour workout that started `daysAgo` days ago, with completedAt on every set. */
function workout(daysAgo: number, exercises: [slug: string, sets: SetInput[]][], extra: Partial<FinishWorkoutInput> = {}): FinishWorkoutInput {
  const startedAt = Date.now() - daysAgo * DAY - 2 * 60 * MINUTE;
  return {
    clientId: randomUUID(),
    startedAt: iso(startedAt),
    finishedAt: iso(startedAt + 60 * MINUTE),
    exercises: exercises.map(([slug, sets]) => ({
      exerciseId: ids[slug]!,
      sets: sets.map((set, i) => ({ ...set, completedAt: iso(startedAt + (i + 1) * 5 * MINUTE) })),
    })),
    ...extra,
  };
}

async function finish(user: TestUser, body: FinishWorkoutInput, expectedStatus = 201) {
  const res = await request(app).post("/workouts").set("Cookie", user.cookie).send(body);
  expect(res.status, res.text).toBe(expectedStatus);
  return finishWorkoutResponseSchema.parse(res.body);
}

const times = (n: number, set: SetInput) => Array.from({ length: n }, () => set);

describe("XP at Finish", () => {
  it("writes one ledger row per completed set, using the shared formula", async () => {
    const user = await signUpPlayer({ bodyweightKg: 80 });

    // Bench (loadFactor 1.25): 8 x 60 -> round(8 x 60 x 1.25 / 10) = 60 XP per set.
    const { workout: saved, summary } = await finish(user, workout(0, [["barbell-bench-press", times(3, { reps: 8, weightKg: 60 })]]));

    const events = await prisma.xpEvent.findMany({ where: { userId: user.userId } });
    expect(events.map((e) => [e.amount, e.source, e.bodyPart])).toEqual(times(3, [60, "workout_set", "chest"] as never));
    expect(events.map((e) => e.sourceId).sort()).toEqual(saved.exercises[0]!.sets.map((s) => s.id).sort());
    expect(summary.xp).toEqual({ sets: 180, weeklyGoal: 0, streakMilestone: 0, total: 180 });
    expect(summary.level).toEqual({ before: 1, after: 2, totalXpBefore: 0, totalXpAfter: 180 }); // level 2 starts at 100
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } })).totalXp).toBe(180);
  });

  it("never awards XP twice: a repeat returns the same summary and writes nothing", async () => {
    const user = await signUpPlayer({ bodyweightKg: 80 });
    const input = workout(0, [["barbell-bench-press", times(3, { reps: 8, weightKg: 60 })]]);

    const first = await finish(user, input, 201);
    const repeat = await finish(user, input, 200);

    expect(repeat).toEqual(first);
    expect(await prisma.xpEvent.count()).toBe(3);
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } })).totalXp).toBe(180);
  });

  it("awards XP once when two identical Finishes race", async () => {
    const user = await signUpPlayer({ bodyweightKg: 80 });
    const input = workout(0, [["barbell-bench-press", times(2, { reps: 8, weightKg: 60 })]]);

    await Promise.all([
      request(app).post("/workouts").set("Cookie", user.cookie).send(input),
      request(app).post("/workouts").set("Cookie", user.cookie).send(input),
    ]);

    expect(await prisma.xpEvent.count()).toBe(2);
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } })).totalXp).toBe(120);
  });

  it("uses the bodyweight in effect on the workout's date, so a 0 kg pull-up still earns XP", async () => {
    const user = await signUpPlayer(); // no bodyweight at sign-up
    await request(app).post("/bodyweight").set("Cookie", user.cookie).send({ kg: 70, measuredOn: isoDate(Date.now() - 10 * DAY) });
    await request(app).post("/bodyweight").set("Cookie", user.cookie).send({ kg: 90 });

    // 5 days ago the 70 kg entry was in effect: round(10 x (0 + 70 x 1.0) x 1.25 / 10) = 88.
    const { summary } = await finish(user, workout(5, [["pull-up", [{ reps: 10, weightKg: 0 }]]]));

    expect(summary.bodyweightKg).toBe(70);
    expect(summary.xp.sets).toBe(88);
  });

  it("falls back to 75 kg when no bodyweight was ever entered", async () => {
    const user = await signUpPlayer();

    const { summary } = await finish(user, workout(0, [["pull-up", [{ reps: 10, weightKg: 0 }]]]));

    expect(summary.bodyweightKg).toBe(75);
    expect(summary.xp.sets).toBe(94); // round(10 x 75 x 1.25 / 10) = round(93.75)
  });
});

describe("personal records in the summary", () => {
  it("sets a baseline on the first workout, then reports beaten records with old and new values", async () => {
    const user = await signUpPlayer({ bodyweightKg: 80 });

    const first = await finish(user, workout(2, [["barbell-bench-press", times(3, { reps: 8, weightKg: 60 })]]));
    // 62.5 x 7 (e1RM 77.1) and then 65 x 6 (78): one line, best new value vs the old best (76).
    const second = await finish(
      user,
      workout(1, [["barbell-bench-press", [{ reps: 7, weightKg: 62.5 }, { reps: 6, weightKg: 65 }]]]),
    );

    expect(first.summary.prs).toEqual([]);
    expect(second.summary.prs).toEqual([
      { exerciseId: ids["barbell-bench-press"], exerciseName: "Bench Press", kind: "e1rm", value: 78, previousValue: 76 },
    ]);
  });

  it("includes bodyweight in a bodyweight exercise's estimated 1RM", async () => {
    const user = await signUpPlayer({ bodyweightKg: 80 });

    await finish(user, workout(2, [["pull-up", [{ reps: 8, weightKg: 0 }]]])); // 80 x (1 + 8/30) = 101.3
    const { summary } = await finish(user, workout(1, [["pull-up", [{ reps: 8, weightKg: 10 }]]])); // 90 -> 114

    expect(summary.prs).toEqual([expect.objectContaining({ kind: "e1rm", value: 114, previousValue: 101.3 })]);
  });

  it("only compares with workouts that started EARLIER, even when synced later", async () => {
    const user = await signUpPlayer({ bodyweightKg: 80 });
    await finish(user, workout(1, [["barbell-bench-press", [{ reps: 8, weightKg: 60 }]]]));

    // An older, heavier workout arriving late from flight mode: nothing before it, no PR.
    const late = await finish(user, workout(5, [["barbell-bench-press", [{ reps: 8, weightKg: 80 }]]]));

    expect(late.summary.prs).toEqual([]);
  });
});

describe("summary stats", () => {
  it("compares duration, sets and volume with the previous workout of the same routine", async () => {
    const user = await signUpPlayer({ bodyweightKg: 80 });
    const routine = await request(app)
      .post("/routines")
      .set("Cookie", user.cookie)
      .send({ name: "Push day", exercises: [{ exerciseId: ids["barbell-bench-press"], targetSets: 3, targetReps: 8 }] });
    const routineId = routine.body.id as string;

    await finish(user, workout(3, [["barbell-bench-press", times(3, { reps: 8, weightKg: 60 })]], { routineId }));
    await finish(user, workout(2, [["deadlift", [{ reps: 5, weightKg: 140 }]]])); // not this routine
    const { summary } = await finish(user, workout(1, [["barbell-bench-press", times(4, { reps: 8, weightKg: 60 })]], { routineId }));

    expect(summary.stats).toEqual({
      durationSec: 3600,
      setCount: 4,
      volumeKg: 1920,
      previous: { durationSec: 3600, setCount: 3, volumeKg: 1440 },
    });
  });

  it("is available again from GET /workouts/:id/summary, for the owner only", async () => {
    const user = await signUpPlayer({ bodyweightKg: 80 });
    const saved = await finish(user, workout(0, [["barbell-bench-press", [{ reps: 8, weightKg: 60 }]]]));

    const again = await request(app).get(`/workouts/${saved.workout.id}/summary`).set("Cookie", user.cookie);
    const intruder = await signUpPlayer();
    const theirs = await request(app).get(`/workouts/${saved.workout.id}/summary`).set("Cookie", intruder.cookie);

    expect(again.body).toEqual(saved);
    expect(theirs.status).toBe(404);
  });
});

describe("routine link", () => {
  async function createRoutine(user: TestUser) {
    const res = await request(app)
      .post("/routines")
      .set("Cookie", user.cookie)
      .send({ name: "Pull day", exercises: [{ exerciseId: ids["pull-up"], targetSets: 3, targetReps: 8 }] });
    return res.body.id as string;
  }

  it("links the workout and moves the routine's lastDoneAt forward, never back", async () => {
    const user = await signUpPlayer();
    const routineId = await createRoutine(user);
    const recent = workout(1, [["pull-up", [{ reps: 8, weightKg: 0 }]]], { routineId });
    const older = workout(4, [["pull-up", [{ reps: 8, weightKg: 0 }]]], { routineId });

    const saved = await finish(user, recent);
    await finish(user, older); // synced late

    expect(saved.workout.routineId).toBe(routineId);
    const routine = await request(app).get(`/routines/${routineId}`).set("Cookie", user.cookie);
    expect(routine.body.lastDoneAt).toBe(recent.startedAt);
  });

  it("drops a link to someone else's routine instead of failing", async () => {
    const owner = await signUpPlayer();
    const user = await signUpPlayer();
    const othersRoutine = await createRoutine(owner);

    const saved = await finish(user, workout(0, [["pull-up", [{ reps: 8, weightKg: 0 }]]], { routineId: othersRoutine }));

    expect(saved.workout.routineId).toBeNull();
    expect((await request(app).get(`/routines/${othersRoutine}`).set("Cookie", owner.cookie)).body.lastDoneAt).toBeNull();
  });

  it("drops a link to a routine deleted while you trained offline", async () => {
    const user = await signUpPlayer();
    const routineId = await createRoutine(user);
    await request(app).delete(`/routines/${routineId}`).set("Cookie", user.cookie);

    const saved = await finish(user, workout(0, [["pull-up", [{ reps: 8, weightKg: 0 }]]], { routineId }));

    expect(saved.workout.routineId).toBeNull();
  });

  it("keeps the workout when its routine is deleted later; only the link is cleared", async () => {
    const user = await signUpPlayer();
    const routineId = await createRoutine(user);
    const saved = await finish(user, workout(0, [["pull-up", [{ reps: 8, weightKg: 0 }]]], { routineId }));

    await request(app).delete(`/routines/${routineId}`).set("Cookie", user.cookie);

    const res = await request(app).get(`/workouts/${saved.workout.id}`).set("Cookie", user.cookie);
    expect(res.status).toBe(200);
    expect(res.body.routineId).toBeNull();
  });
});

describe("rest times and completion times", () => {
  it("saves each exercise's rest, and remembers it as a preference only when the player chose it", async () => {
    const user = await signUpPlayer();
    const input = workout(0, [
      ["barbell-bench-press", [{ reps: 8, weightKg: 60 }]],
      ["lateral-raise", [{ reps: 15, weightKg: 10 }]],
    ]);
    input.exercises[0] = { ...input.exercises[0]!, restSec: 165, saveRestAsPreference: true };
    input.exercises[1] = { ...input.exercises[1]!, restSec: 60 }; // the suggestion, untouched

    const { workout: saved } = await finish(user, input);
    const library = await request(app).get("/exercises").set("Cookie", user.cookie);
    const pref = (name: string) => library.body.items.find((e: { name: string }) => e.name === name).restPreferenceSec;

    expect(saved.exercises.map((e) => e.restSec)).toEqual([165, 60]);
    expect([pref("Bench Press"), pref("Lateral Raise")]).toEqual([165, null]);
  });

  it("stores when each set was completed", async () => {
    const user = await signUpPlayer();
    const input = workout(0, [["pull-up", [{ reps: 8, weightKg: 0 }]]]);

    const { workout: saved } = await finish(user, input);

    expect(saved.exercises[0]!.sets[0]!.completedAt).toBe(input.exercises[0]!.sets[0]!.completedAt);
  });

  it("rejects a set completed outside the workout", async () => {
    const user = await signUpPlayer();
    const input = workout(0, [["pull-up", [{ reps: 8, weightKg: 0 }]]]);
    input.exercises[0]!.sets[0]!.completedAt = iso(Date.parse(input.startedAt) - MINUTE);

    const res = await request(app).post("/workouts").set("Cookie", user.cookie).send(input);

    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe("exercises.0.sets.0.completedAt");
  });

  it("still accepts workouts queued by the 4b app (no completedAt or restSec)", async () => {
    const user = await signUpPlayer();
    const old = workout(0, [["pull-up", [{ reps: 8, weightKg: 0 }]]]);
    delete old.exercises[0]!.sets[0]!.completedAt;

    const { workout: saved } = await finish(user, old);

    expect(saved.exercises[0]).toMatchObject({ restSec: null, sets: [expect.objectContaining({ completedAt: null })] });
  });
});

describe("weights stay exact for lb players (stored in kg, 3 decimals)", () => {
  it("round-trips 135 / 225 / 46.25 lb through the API and the database", async () => {
    const user = await signUpPlayer();
    const lbs = [135, 225, 46.25];

    const { workout: saved } = await finish(
      user,
      workout(0, [["barbell-bench-press", lbs.map((lb) => ({ reps: 5, weightKg: fromInputWeight(lb, "lb") }))]]),
    );
    const reread = await request(app).get(`/workouts/${saved.id}`).set("Cookie", user.cookie);

    const sets = reread.body.exercises[0].sets as { weightKg: number }[];
    expect(sets.map((s) => s.weightKg)).toEqual([61.235, 102.058, 20.979]);
    expect(sets.map((s) => toDisplayWeight(s.weightKg, "lb"))).toEqual(lbs);
  });

  it("keeps a lb bodyweight exact too", async () => {
    const user = await signUpPlayer();

    const res = await request(app).post("/bodyweight").set("Cookie", user.cookie).send({ kg: fromInputWeight(180, "lb") });

    expect(res.body.kg).toBe(81.647);
    expect(toDisplayWeight(res.body.kg, "lb")).toBe(180);
  });
});
