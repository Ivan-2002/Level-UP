import { describe, expect, it } from "vitest";
import {
  addToRecordBook,
  clampRestSec,
  coachAdvice,
  coachHintText,
  emptyRecordBook,
  estimatedOneRepMax,
  exerciseStats,
  findNewRecords,
  liftedKg,
  resolveRestSec,
  setXp,
  volumeKg,
  DEFAULT_INCREMENTS,
} from "./index.js";

const squat = { loadFactor: 1.0, bodyweightRatio: 0 };
const pullUp = { loadFactor: 1.25, bodyweightRatio: 1.0 };
const lateralRaise = { loadFactor: 5.0, bodyweightRatio: 0 };

describe("setXp = round(reps x effective kg / 10)", () => {
  it("matches the formula for a loaded lift", () => {
    expect(setXp({ reps: 8, weightKg: 100 }, 80, squat)).toBe(80); // 8 x 100 / 10
  });

  it("doesn't penalise bodyweight: a 0 kg pull-up still earns XP from your body", () => {
    expect(setXp({ reps: 8, weightKg: 0 }, 80, pullUp)).toBe(80); // 8 x (0 + 80) x 1.25 / 10
    expect(setXp({ reps: 8, weightKg: 10 }, 80, pullUp)).toBe(90); // added weight counts too
  });

  it("lifts light isolation work with its factor, so a hard set earns about as much as a squat set", () => {
    expect(setXp({ reps: 15, weightKg: 10 }, 80, lateralRaise)).toBe(75);
  });
});

describe("estimatedOneRepMax (Epley)", () => {
  it("uses kg x (1 + reps / 30), rounded to 0.1 kg", () => {
    expect(estimatedOneRepMax(60, 8)).toBe(76);
    expect(estimatedOneRepMax(62.5, 7)).toBe(77.1);
  });

  it("treats a single as exactly the weight lifted", () => {
    expect(estimatedOneRepMax(140, 1)).toBe(140);
  });

  it("gives no estimate above 12 reps", () => {
    expect(estimatedOneRepMax(40, 12)).toBe(56);
    expect(estimatedOneRepMax(40, 13)).toBeNull();
  });
});

describe("liftedKg", () => {
  it("adds the moved share of bodyweight to the logged weight", () => {
    expect(liftedKg(10, 80, 1)).toBe(90);
    expect(liftedKg(0, 80, 0.65)).toBe(52);
  });
});

describe("findNewRecords", () => {
  const history = addToRecordBook(emptyRecordBook(), [{ reps: 8, loadKg: 60 }], "reps"); // best e1RM 76

  it("flags a set whose estimated 1RM beats the previous best", () => {
    expect(findNewRecords(history, [{ reps: 8, loadKg: 60 }, { reps: 7, loadKg: 62.5 }], "reps")).toEqual([
      { index: 1, kind: "e1rm", value: 77.1, previousValue: 76 },
    ]);
  });

  it("lets a later set beat an earlier PR in the same session", () => {
    const records = findNewRecords(history, [{ reps: 7, loadKg: 62.5 }, { reps: 6, loadKg: 65 }], "reps");
    expect(records.map((r) => [r.index, r.value, r.previousValue])).toEqual([
      [0, 77.1, 76],
      [1, 78, 77.1],
    ]);
  });

  it("sets a baseline on the first ever session instead of calling everything a PR", () => {
    expect(findNewRecords(emptyRecordBook(), [{ reps: 8, loadKg: 60 }, { reps: 8, loadKg: 70 }], "reps")).toEqual([]);
  });

  it("judges sets above 12 reps as 'most reps at this weight or heavier', not by 1RM", () => {
    const past = addToRecordBook(emptyRecordBook(), [{ reps: 15, loadKg: 40 }, { reps: 20, loadKg: 30 }], "reps");

    expect(findNewRecords(past, [{ reps: 16, loadKg: 40 }], "reps")).toEqual([
      { index: 0, kind: "reps_at_weight", value: 16, previousValue: 15 },
    ]);
    // 18 reps at 35 kg: the most ever at 35 kg or heavier was 15 (at 40). That's a PR.
    expect(findNewRecords(past, [{ reps: 18, loadKg: 35 }], "reps")).toEqual([
      { index: 0, kind: "reps_at_weight", value: 18, previousValue: 15 },
    ]);
    expect(findNewRecords(past, [{ reps: 14, loadKg: 40 }], "reps")).toEqual([]);
  });

  it("uses the longest hold for timed exercises", () => {
    const past = addToRecordBook(emptyRecordBook(), [{ reps: 60, loadKg: 40 }], "seconds");

    expect(findNewRecords(past, [{ reps: 55, loadKg: 40 }, { reps: 75, loadKg: 40 }], "seconds")).toEqual([
      { index: 1, kind: "longest_hold", value: 75, previousValue: 60 },
    ]);
  });
});

describe("exerciseStats", () => {
  it("finds the best estimated 1RM, heaviest set, best session volume and most reps", () => {
    const stats = exerciseStats([
      { date: "2026-11-01", sets: [{ reps: 8, loadKg: 60, weightKg: 60 }, { reps: 8, loadKg: 60, weightKg: 60 }] },
      { date: "2026-11-08", sets: [{ reps: 3, loadKg: 80, weightKg: 80 }, { reps: 15, loadKg: 40, weightKg: 40 }] },
    ]);

    expect(stats.bestE1rm).toMatchObject({ e1rm: 88, date: "2026-11-08" }); // 80 x 3
    expect(stats.heaviestSet).toMatchObject({ loadKg: 80, reps: 3 });
    expect(stats.bestSessionVolume).toEqual({ volumeKg: 960, date: "2026-11-01" });
    expect(stats.mostReps).toMatchObject({ reps: 15, loadKg: 40 });
  });

  it("is empty with no history", () => {
    expect(exerciseStats([])).toEqual({ bestE1rm: null, heaviestSet: null, bestSessionVolume: null, mostReps: null });
  });
});

describe("volumeKg", () => {
  it("sums reps x lifted kg", () => {
    expect(volumeKg([{ reps: 8, loadKg: 60 }, { reps: 6, loadKg: 62.5 }])).toBe(855);
  });
});

describe("rest time", () => {
  it("prefers the player's choice, then the routine, then the exercise, then 2:00", () => {
    expect(resolveRestSec({ preferenceSec: 90, routineSec: 150, suggestedSec: 180 })).toBe(90);
    expect(resolveRestSec({ preferenceSec: null, routineSec: 150, suggestedSec: 180 })).toBe(150);
    expect(resolveRestSec({ suggestedSec: 180 })).toBe(180);
    expect(resolveRestSec({})).toBe(120);
  });

  it("snaps to 15 s steps between 15 s and 10 min", () => {
    expect([clampRestSec(0), clampRestSec(97), clampRestSec(5000)]).toEqual([15, 90, 600]);
  });
});

describe("coachAdvice (double progression)", () => {
  const barbell = { equipment: "barbell" as const, repsUnit: "reps" as const };

  it("adds the equipment's increment when every set hit the target", () => {
    const advice = coachAdvice({ ...barbell, lastSets: [8, 8, 8].map((reps) => ({ reps, weightKg: 60 })), targetReps: 8 });

    expect(advice).toEqual({ kind: "increase_weight", lastWeightKg: 60, lastReps: [8, 8, 8], weightKg: 62.5, reps: 8 });
    expect(coachHintText(advice, "reps")).toBe("You hit 8, 8, 8 at 60 kg last time, so today's target is 62.5 kg.");
  });

  it("keeps the weight when a set fell short (8, 8, 7 at 60 kg stays at 60 kg)", () => {
    const advice = coachAdvice({ ...barbell, lastSets: [8, 8, 7].map((reps) => ({ reps, weightKg: 60 })) });

    expect(advice).toMatchObject({ kind: "repeat", weightKg: 60, reps: 8 });
    expect(coachHintText(advice, "reps")).toBe("You hit 8, 8, 7 at 60 kg last time. Stay there and aim for 8, 8, 8.");
  });

  it("only judges the working sets: last time's heaviest weight", () => {
    const lastSets = [
      { reps: 10, weightKg: 40 }, // warm-up
      { reps: 8, weightKg: 60 },
      { reps: 8, weightKg: 60 },
    ];
    expect(coachAdvice({ ...barbell, lastSets, targetReps: 8 })).toMatchObject({ kind: "increase_weight", weightKg: 62.5 });
  });

  it("uses a configurable increment per equipment type", () => {
    const lastSets = [{ reps: 10, weightKg: 12 }];
    expect(coachAdvice({ equipment: "dumbbell", repsUnit: "reps", lastSets, targetReps: 10 })).toMatchObject({ weightKg: 13 });
    expect(
      coachAdvice({ equipment: "dumbbell", repsUnit: "reps", lastSets, targetReps: 10, increments: { ...DEFAULT_INCREMENTS, dumbbell: 2 } }),
    ).toMatchObject({ weightKg: 14 });
  });

  it("adds a rep for bodyweight exercises and 5 s for timed ones", () => {
    const pullUps = coachAdvice({ equipment: "bodyweight", repsUnit: "reps", lastSets: [{ reps: 10, weightKg: 0 }], targetReps: 10 });
    const plank = coachAdvice({ equipment: "bodyweight", repsUnit: "seconds", lastSets: [{ reps: 60, weightKg: 0 }], targetReps: 60 });

    expect(coachHintText(pullUps, "reps")).toBe("You hit 10 last time. Aim for 11 reps today.");
    expect(coachHintText(plank, "seconds")).toBe("You held 60s last time. Aim for 65s today.");
  });

  it("explains the first time", () => {
    expect(coachHintText(coachAdvice({ ...barbell, lastSets: [], targetReps: 5 }), "reps")).toBe(
      "First time: pick a weight you can lift for 5 good reps.",
    );
  });
});
