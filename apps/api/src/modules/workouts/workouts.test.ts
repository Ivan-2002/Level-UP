import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { finishWorkoutResponseSchema, workoutPageSchema, type FinishWorkoutInput } from "@levelup/shared";
import { prisma } from "../../lib/prisma.js";
import { app, seedExercises, signUpPlayer, signUpUser, type TestUser } from "../../test/helpers.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();

let exerciseIds: Record<string, string>;
let user: TestUser;

beforeEach(async () => {
  exerciseIds = await seedExercises();
  user = await signUpPlayer();
});

/** A valid workout that finished 5 minutes ago and lasted an hour: bench, then pull-ups. */
function validWorkout(overrides: Partial<FinishWorkoutInput> = {}): FinishWorkoutInput {
  const finishedAt = Date.now() - 5 * MINUTE;
  return {
    clientId: randomUUID(),
    name: "Push & pull",
    startedAt: iso(finishedAt - HOUR),
    finishedAt: iso(finishedAt),
    exercises: [
      {
        exerciseId: exerciseIds["barbell-bench-press"]!,
        sets: [
          { reps: 8, weightKg: 60 },
          { reps: 8, weightKg: 62.5 },
          { reps: 6, weightKg: 65 },
        ],
      },
      { exerciseId: exerciseIds["pull-up"]!, sets: [{ reps: 10, weightKg: 0 }] },
    ],
    ...overrides,
  };
}

function finish(as: TestUser, body: unknown) {
  return request(app).post("/workouts").set("Cookie", as.cookie).send(body as object);
}

/** n sets of the same exercise, for the set-limit tests. */
function workoutWithSets(n: number) {
  return validWorkout({
    exercises: [
      { exerciseId: exerciseIds["barbell-back-squat"]!, sets: Array.from({ length: n }, () => ({ reps: 5, weightKg: 100 })) },
    ],
  });
}

describe("workout routes without a session", () => {
  it.each([
    ["POST /workouts", () => request(app).post("/workouts").send({})],
    ["GET /workouts", () => request(app).get("/workouts")],
    ["GET /workouts/:id", () => request(app).get(`/workouts/${randomUUID()}`)],
  ])("%s returns 401", async (_route, send) => {
    const res = await send();

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });
});

describe("POST /workouts without a character", () => {
  it("returns 409 ProfileRequired: XP needs a character to go to", async () => {
    const noCharacter = await signUpUser();

    const res = await finish(noCharacter, validWorkout());

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("ProfileRequired");
    expect(await prisma.workout.count()).toBe(0);
  });
});

describe("POST /workouts", () => {
  it("saves the whole workout and returns it in the shared contract shape", async () => {
    const input = validWorkout();

    const res = await finish(user, input);

    expect(res.status).toBe(201);
    const { workout } = finishWorkoutResponseSchema.parse(res.body); // throws if the contract drifted
    expect(workout).toMatchObject({ clientId: input.clientId, name: "Push & pull", startedAt: input.startedAt });
    // Orders come from array positions: 0, 1 for exercises; 0, 1, 2 for sets.
    expect(workout.exercises.map((e) => [e.order, e.exercise.name])).toEqual([
      [0, "Bench Press"],
      [1, "Pull-up"],
    ]);
    expect(workout.exercises[0]!.sets.map((s) => [s.setOrder, s.reps, s.weightKg])).toEqual([
      [0, 8, 60],
      [1, 8, 62.5], // DECIMAL comes back as a plain number
      [2, 6, 65],
    ]);
  });

  it("can be read back with GET /workouts/:id", async () => {
    const created = await finish(user, validWorkout());

    const res = await request(app).get(`/workouts/${created.body.workout.id}`).set("Cookie", user.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body.workout);
  });

  it("allows an unnamed workout", async () => {
    const { name: _, ...unnamed } = validWorkout();

    const res = await finish(user, unnamed);

    expect(res.status).toBe(201);
    expect(res.body.workout.name).toBeNull();
  });
});

describe("POST /workouts idempotency (clientId)", () => {
  it("answers a repeat with 200 and the SAME workout, creating nothing new", async () => {
    const input = validWorkout();

    const first = await finish(user, input);
    const repeat = await finish(user, input);

    expect(first.status).toBe(201);
    expect(repeat.status).toBe(200);
    expect(repeat.body).toEqual(first.body);
    expect(await prisma.workout.count()).toBe(1);
    expect(await prisma.workoutSet.count()).toBe(4);
  });

  it("keeps the first version when a repeat carries different data", async () => {
    const input = validWorkout();
    await finish(user, input);

    const repeat = await finish(user, { ...input, name: "Edited on retry" });

    expect(repeat.status).toBe(200);
    expect(repeat.body.workout.name).toBe("Push & pull");
  });

  it("saves exactly one workout when two identical requests race", async () => {
    const input = validWorkout();

    const results = await Promise.all([finish(user, input), finish(user, input)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(results[0]!.body.workout.id).toBe(results[1]!.body.workout.id);
    expect(await prisma.workout.count()).toBe(1);
  });

  it("scopes clientId to the user: someone else's clientId never returns their workout", async () => {
    const input = validWorkout();
    const mine = await finish(user, input);
    const otherUser = await signUpPlayer();

    const theirs = await finish(otherUser, input);

    expect(theirs.status).toBe(201);
    expect(theirs.body.workout.id).not.toBe(mine.body.workout.id);
    expect(await prisma.workout.count()).toBe(2);
  });
});

describe("POST /workouts validation", () => {
  const now = () => Date.now();

  it.each<[string, () => unknown, string]>([
    ["reps of 0", () => validWorkout({ exercises: [{ exerciseId: exerciseIds["pull-up"]!, sets: [{ reps: 0, weightKg: 0 }] }] }), "exercises.0.sets.0.reps"],
    ["reps of 101", () => validWorkout({ exercises: [{ exerciseId: exerciseIds["pull-up"]!, sets: [{ reps: 101, weightKg: 0 }] }] }), "exercises.0.sets.0.reps"],
    ["fractional reps", () => validWorkout({ exercises: [{ exerciseId: exerciseIds["pull-up"]!, sets: [{ reps: 7.5, weightKg: 0 }] }] }), "exercises.0.sets.0.reps"],
    ["negative weight", () => validWorkout({ exercises: [{ exerciseId: exerciseIds["deadlift"]!, sets: [{ reps: 5, weightKg: -1 }] }] }), "exercises.0.sets.0.weightKg"],
    ["weight over 500 kg", () => validWorkout({ exercises: [{ exerciseId: exerciseIds["deadlift"]!, sets: [{ reps: 5, weightKg: 501 }] }] }), "exercises.0.sets.0.weightKg"],
    ["101 sets", () => workoutWithSets(101), "exercises"],
    ["an exercise with no sets", () => validWorkout({ exercises: [{ exerciseId: exerciseIds["pull-up"]!, sets: [] }] }), "exercises.0.sets"],
    ["no exercises", () => validWorkout({ exercises: [] }), "exercises"],
    ["finishedAt before startedAt", () => validWorkout({ startedAt: iso(now() - HOUR), finishedAt: iso(now() - 2 * HOUR) }), "finishedAt"],
    ["finishedAt equal to startedAt", () => validWorkout({ startedAt: iso(now() - HOUR), finishedAt: iso(now() - HOUR) }), "finishedAt"],
    ["finishedAt in the future", () => validWorkout({ startedAt: iso(now()), finishedAt: iso(now() + HOUR) }), "finishedAt"],
    ["longer than 6 hours", () => validWorkout({ startedAt: iso(now() - 7 * HOUR), finishedAt: iso(now() - MINUTE) }), "finishedAt"],
    ["a date that isn't ISO 8601", () => validWorkout({ startedAt: "yesterday at 6" }), "startedAt"],
    ["a clientId that isn't a UUID", () => validWorkout({ clientId: "workout-1" }), "clientId"],
    ["an exerciseId that isn't a UUID", () => validWorkout({ exercises: [{ exerciseId: "bench", sets: [{ reps: 5, weightKg: 60 }] }] }), "exercises.0.exerciseId"],
  ])("rejects %s with 400 ValidationError naming the field", async (_rule, makeBody, path) => {
    const res = await finish(user, makeBody());

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
    expect(res.body.issues.map((i: { path: string }) => i.path)).toContain(path);
    expect(await prisma.workout.count()).toBe(0);
  });

  it("accepts the limits themselves: 100 sets, 1 and 100 reps, 0 and 500 kg, exactly 6 hours", async () => {
    const end = Date.now() - MINUTE;
    const limits = validWorkout({
      startedAt: iso(end - 6 * HOUR),
      finishedAt: iso(end),
      exercises: [
        {
          exerciseId: exerciseIds["deadlift"]!,
          sets: [{ reps: 1, weightKg: 500 }, { reps: 100, weightKg: 0 }, ...Array.from({ length: 98 }, () => ({ reps: 5, weightKg: 100 }))],
        },
      ],
    });

    const res = await finish(user, limits);

    expect(res.status).toBe(201);
    expect(await prisma.workoutSet.count()).toBe(100);
  });

  it("rejects an exercise id that doesn't exist with 400 UnknownExercise, saving nothing", async () => {
    const missingId = randomUUID();
    const input = validWorkout();
    input.exercises.push({ exerciseId: missingId, sets: [{ reps: 5, weightKg: 20 }] });

    const res = await finish(user, input);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UnknownExercise");
    expect(res.body.message).toContain(missingId);
    expect(await prisma.workout.count()).toBe(0);
  });
});

describe("GET /workouts/:id", () => {
  it("returns 404 for another user's workout, never their data", async () => {
    const theirs = await finish(user, validWorkout({ name: "Private session" }));
    const intruder = await signUpPlayer();

    const res = await request(app).get(`/workouts/${theirs.body.workout.id}`).set("Cookie", intruder.cookie);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "WorkoutNotFound", message: "Workout not found." });
    expect(JSON.stringify(res.body)).not.toContain("Private session");
  });

  it("returns 404 for an id that doesn't exist, or isn't even a UUID", async () => {
    for (const id of [randomUUID(), "not-a-uuid"]) {
      const res = await request(app).get(`/workouts/${id}`).set("Cookie", user.cookie);
      expect(res.status, id).toBe(404);
    }
  });
});

describe("GET /workouts (history)", () => {
  /** Saves a one-exercise workout that started `daysAgo` days ago. */
  async function logWorkout(as: TestUser, daysAgo: number, name = `${daysAgo} days ago`) {
    const startedAt = Date.now() - daysAgo * 24 * HOUR;
    const res = await finish(as, validWorkout({ name, startedAt: iso(startedAt), finishedAt: iso(startedAt + HOUR) }));
    expect(res.status).toBe(201);
    return res.body.workout.id as string;
  }

  async function getPage(as: TestUser, query: string) {
    const res = await request(app).get(`/workouts${query}`).set("Cookie", as.cookie);
    expect(res.status).toBe(200);
    return workoutPageSchema.parse(res.body);
  }

  it("lists newest first by when you trained, not when it was saved", async () => {
    // Saved out of order, like workouts synced late from airplane mode.
    for (const daysAgo of [3, 1, 5, 2, 4]) await logWorkout(user, daysAgo);

    const page = await getPage(user, "");

    expect(page.items.map((w) => w.name)).toEqual([
      "1 days ago",
      "2 days ago",
      "3 days ago",
      "4 days ago",
      "5 days ago",
    ]);
    expect(page.items[0]).toMatchObject({ exerciseCount: 2, setCount: 4 });
    expect(page.nextCursor).toBeNull();
  });

  it("pages with a cursor: every workout exactly once, in order, then nextCursor null", async () => {
    for (const daysAgo of [3, 1, 5, 2, 4]) await logWorkout(user, daysAgo);

    const first = await getPage(user, "?limit=2");
    const second = await getPage(user, `?limit=2&cursor=${first.nextCursor}`);
    const third = await getPage(user, `?limit=2&cursor=${second.nextCursor}`);

    expect([first, second, third].map((p) => p.items.map((w) => w.name))).toEqual([
      ["1 days ago", "2 days ago"],
      ["3 days ago", "4 days ago"],
      ["5 days ago"],
    ]);
    expect(first.nextCursor).not.toBeNull();
    expect(third.nextCursor).toBeNull();
  });

  it("never skips or repeats workouts that started at the same moment", async () => {
    const startedAt = Date.now() - 2 * HOUR;
    for (const name of ["A", "B", "C"]) {
      await finish(user, validWorkout({ name, startedAt: iso(startedAt), finishedAt: iso(startedAt + HOUR) }));
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof getPage>> = await getPage(user, `?limit=1${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...page.items.map((w) => w.name!));
      cursor = page.nextCursor;
    } while (cursor);

    expect(seen.sort()).toEqual(["A", "B", "C"]);
  });

  it("only lists your own workouts", async () => {
    await logWorkout(user, 1, "Mine");
    await logWorkout(await signUpPlayer(), 1, "Someone else's");

    const page = await getPage(user, "");

    expect(page.items.map((w) => w.name)).toEqual(["Mine"]);
  });

  it.each([
    ["a cursor that isn't one of ours", "?cursor=garbage", "InvalidCursor"],
    ["a page size over 50", "?limit=51", "ValidationError"],
    ["a page size of 0", "?limit=0", "ValidationError"],
  ])("rejects %s with 400", async (_case, query, error) => {
    const res = await request(app).get(`/workouts${query}`).set("Cookie", user.cookie);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
  });
});
