import { describe, expect, it } from "vitest";
import {
  epleyOneRepMax,
  MAX_XP_SETS_PER_EXERCISE,
  recentBest,
  scoreSessionSets,
  setTagText,
  setXp,
  type ExerciseXpHistory,
  type ScoringExercise,
  type SessionSet,
} from "./index.js";

const squat: ScoringExercise = { equipment: "barbell", mechanic: "compound", repsUnit: "reps", loadFactor: 1, bodyweightRatio: 0 };
const bench: ScoringExercise = { equipment: "barbell", mechanic: "compound", repsUnit: "reps", loadFactor: 1.25, bodyweightRatio: 0 };
const plank: ScoringExercise = { equipment: "bodyweight", mechanic: "isolation", repsUnit: "seconds", loadFactor: 0.35, bodyweightRatio: 0.5 };
const exercises = new Map([
  ["squat", squat],
  ["bench", bench],
  ["plank", plank],
]);

/** A player whose best back squat is 100 kg x 8, this month. */
const squatHistory: ExerciseXpHistory = { recentBest: epleyOneRepMax(100, 8), jumpBaseline: epleyOneRepMax(100, 8) };

const set = (exerciseId: string, reps: number, weightKg: number): SessionSet => ({ exerciseId, reps, weightKg });
const times = (n: number, s: SessionSet) => Array.from({ length: n }, () => s);
const score = (sets: SessionSet[], history = new Map([["squat", squatHistory]])) =>
  scoreSessionSets({ sets, exercises, history, bodyweight: { xp: 75, typed: 75 } });

const warmUps = [set("squat", 5, 20), set("squat", 5, 40), set("squat", 3, 60), set("squat", 2, 70), set("squat", 1, 80)];

describe("scoreSessionSets", () => {
  it("earns XP for all 6 working sets after 5 warm-ups (warm-ups don't count toward the 10)", () => {
    const { sets } = score([...warmUps, ...times(6, set("squat", 8, 100))]);

    expect(sets.slice(0, 5).map((s) => s.tag)).toEqual(Array(5).fill("warm_up"));
    // 1, 3, 5, 5 and 4 XP: each under 10% of a working set's 92.
    expect(sets.slice(0, 5).map((s) => s.xp)).toEqual([1, 3, 5, 5, 4]);
    expect(sets.slice(5).map((s) => [s.xp, s.tag])).toEqual(Array(6).fill([92, null]));
  });

  it("gives the 11th non-warm-up set 0 XP with the 'Beyond 10 sets' tag", () => {
    const { sets } = score([...warmUps, ...times(11, set("squat", 8, 100))]);
    const working = sets.slice(5);

    expect(working.slice(0, 10).every((s) => s.xp === 92)).toBe(true);
    expect(working[10]).toMatchObject({ xp: 0, tag: "beyond_set_limit", isFlagged: false });
    expect(setTagText("beyond_set_limit")).toBe("Beyond 10 sets");
  });

  it("shares one count when the same exercise appears twice in a session (a superset)", () => {
    const block = [...times(3, set("squat", 8, 100)), ...times(3, set("bench", 8, 80))];
    const { sets } = score([...block, ...block, ...block, ...block]); // 12 squat sets, 12 bench sets
    const squatSets = sets.filter((_, i) => i % 6 < 3);

    expect(squatSets.filter((s) => s.tag === "beyond_set_limit")).toHaveLength(12 - MAX_XP_SETS_PER_EXERCISE);
    expect(squatSets.slice(10).every((s) => s.xp === 0)).toBe(true);
  });

  it("counts easy sets toward the 10 (only warm-ups before the heaviest set are free)", () => {
    const { sets } = score([set("squat", 8, 100), ...times(10, set("squat", 10, 50))]);

    expect(sets.slice(1, 10).map((s) => s.tag)).toEqual(Array(9).fill("easy_set"));
    expect(sets[10]).toMatchObject({ xp: 0, tag: "beyond_set_limit" });
  });

  it("flags an implausible set (0 XP, not counted toward the 10) and scores the rest", () => {
    const { sets } = score([set("squat", 8, 400), set("squat", 8, 100)]);

    expect(sets[0]).toMatchObject({ xp: 0, tag: "check_set", flagReason: "weight_above_range", isFlagged: true });
    expect(sets[1]).toMatchObject({ xp: 92, tag: null });
  });

  it("caps a set far above the player's best at the 25% line", () => {
    const { sets } = score([set("squat", 8, 140)]); // 177 kg estimated vs a best of 126.7

    expect(sets[0]).toMatchObject({ tag: "above_history", flagReason: "above_history", isFlagged: false });
    expect(sets[0]!.xp).toBe(Math.round(setXp({ reps: 8, weightKg: 140 }, 75, squat) * ((126.67 * 1.25) / 177.33)));
  });

  it("measures effort against this session's best when there's no recent history (first session, or back after a break)", () => {
    const { sets } = score([set("squat", 8, 100), set("squat", 8, 100)], new Map());
    expect(sets.map((s) => s.effort)).toEqual([1, 1]);
  });

  it("lets a new account farm at most 10 singles of one exercise", () => {
    const { sets } = score(times(60, set("squat", 1, 60)), new Map());

    expect(sets.filter((s) => s.xp > 0)).toHaveLength(10);
    expect(sets.reduce((sum, s) => sum + s.xp, 0)).toBe(10 * 44);
  });

  it("counts a timed set to 120 seconds and tags a longer hold", () => {
    const { sets } = score([set("plank", 60, 0), set("plank", 300, 0)]);
    expect(sets.map((s) => [s.xp, s.tag])).toEqual([
      [79, null],
      [158, "timed_limit"],
    ]);
  });

  it("reports each exercise's baseline and best for the next session", () => {
    const { exercises: after } = score([set("squat", 8, 100), set("squat", 5, 110)]);
    expect(after.get("squat")).toEqual({ jumpBaselineAfter: epleyOneRepMax(110, 5), sessionBest: epleyOneRepMax(110, 5) });
  });
});

describe("recentBest: the 12-week window for effort", () => {
  it("includes sessions from the last 84 days and ignores older ones", () => {
    const sessions = [
      { date: "2026-08-24", value: 140 }, // 85 days before 17 Nov: outside
      { date: "2026-08-25", value: 120 }, // 84 days: inside
      { date: "2026-11-10", value: 110 },
    ];
    expect(recentBest(sessions, "2026-11-17")).toBe(120);
    expect(recentBest([{ date: "2026-01-01", value: 140 }], "2026-11-17")).toBeNull();
  });
});
