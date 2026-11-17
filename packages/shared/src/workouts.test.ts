import { describe, expect, it } from "vitest";
import {
  exerciseSchema,
  finishWorkoutSchema,
  HOLD_MAX_SEC,
  listWorkoutsQuerySchema,
  REPS_MAX,
  REPS_MAX_ANY_UNIT,
  repsMaxFor,
  type FinishWorkoutInput,
} from "./index.js";

const HOUR = 60 * 60 * 1000;
const EXERCISE_ID = "0195f3a0-0000-7000-8000-000000000001";

function workout(overrides: Partial<FinishWorkoutInput> = {}, setsPerExercise = 3): FinishWorkoutInput {
  const finishedAt = Date.now() - 60_000;
  return {
    clientId: "4f6c8f52-6a5e-4d8e-9a43-2d5a3c1b7e10",
    startedAt: new Date(finishedAt - HOUR).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    exercises: [
      { exerciseId: EXERCISE_ID, sets: Array.from({ length: setsPerExercise }, () => ({ reps: 8, weightKg: 60 })) },
    ],
    ...overrides,
  };
}

function issueMessages(input: unknown) {
  const result = finishWorkoutSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("exerciseSchema", () => {
  it("still parses an exercise cached before the plausibility overrides existed", () => {
    const cachedBeforeMilestone5 = {
      id: EXERCISE_ID, name: "Back Squat", muscleGroup: "Quadriceps", bodyPart: "legs", equipment: "barbell", repsUnit: "reps",
      mechanic: "compound", suggestedRestSec: 180, loadFactor: 1, bodyweightRatio: 0, isCustom: false, restPreferenceSec: null,
    };
    expect(exerciseSchema.parse(cachedBeforeMilestone5)).toMatchObject({ maxPlausibleWeightKg: null, maxPlausibleReps: null });
  });
});

describe("reps limits by unit", () => {
  it("allows 100 reps, or 600 seconds for a timed exercise", () => {
    expect(repsMaxFor("reps")).toBe(REPS_MAX);
    expect(repsMaxFor("seconds")).toBe(HOLD_MAX_SEC);
    expect([REPS_MAX, HOLD_MAX_SEC]).toEqual([100, 600]);
  });

  it("lets the schema through up to the largest limit of any unit (the server checks the unit next)", () => {
    const withReps = (reps: number) => workout({ exercises: [{ exerciseId: EXERCISE_ID, sets: [{ reps, weightKg: 0 }] }] });
    expect(issueMessages(withReps(REPS_MAX_ANY_UNIT))).toEqual([]);
    expect(issueMessages(withReps(REPS_MAX_ANY_UNIT + 1))).toEqual(["Reps must be at most 600."]);
  });
});

describe("finishWorkoutSchema boundaries", () => {
  it("accepts exactly 100 sets and rejects 101", () => {
    expect(issueMessages(workout({}, 100))).toEqual([]);
    expect(issueMessages(workout({}, 101))).toEqual([expect.stringContaining("at most 100 sets")]);
  });

  it("accepts exactly 6 hours and rejects a millisecond more", () => {
    const end = Date.now() - 60_000;
    const at = (ms: number) => new Date(ms).toISOString();
    expect(issueMessages(workout({ startedAt: at(end - 6 * HOUR), finishedAt: at(end) }))).toEqual([]);
    expect(issueMessages(workout({ startedAt: at(end - 6 * HOUR - 1), finishedAt: at(end) }))).toEqual([
      "A workout can last at most 6 hours.",
    ]);
  });

  it("tolerates a phone clock a little ahead of the server, but not an hour", () => {
    const at = (ms: number) => new Date(ms).toISOString();
    const slightlyAhead = Date.now() + 2 * 60_000;
    expect(issueMessages(workout({ startedAt: at(slightlyAhead - HOUR), finishedAt: at(slightlyAhead) }))).toEqual([]);

    const hourAhead = Date.now() + HOUR;
    expect(issueMessages(workout({ startedAt: at(hourAhead - HOUR), finishedAt: at(hourAhead) }))).toEqual([
      "A workout can't finish in the future.",
    ]);
  });

  it("accepts dates with a timezone offset, as phones often send them", () => {
    expect(
      issueMessages(workout({ startedAt: "2026-11-09T07:00:00+02:00", finishedAt: "2026-11-09T08:15:00+02:00" })),
    ).toEqual([]);
  });
});

describe("listWorkoutsQuerySchema", () => {
  it("turns query-string text into numbers and defaults the page size", () => {
    expect(listWorkoutsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(listWorkoutsQuerySchema.parse({ limit: "5" })).toEqual({ limit: 5 });
  });

  it("caps the page size at 50", () => {
    expect(listWorkoutsQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
  });
});
