import { describe, expect, it } from "vitest";
import {
  addToRecordBook,
  bodyweightOnDate,
  BODYWEIGHT_XP,
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
  xpBodyweightOnDate,
  DEFAULT_INCREMENTS,
} from "./index.js";

const squat = { loadFactor: 1.0, bodyweightRatio: 0 };
const pullUp = { loadFactor: 1.25, bodyweightRatio: 1.0 };
const lateralRaise = { loadFactor: 5.0, bodyweightRatio: 0 };

const bench = { loadFactor: 1.25, bodyweightRatio: 0 };

describe("setXp = round(reps x effective kg x (75 / bodyweight) / 10)", () => {
  // At the 75 kg reference the bodyweight factor is 1, so these are the plain formula.
  it("matches the formula for a loaded lift", () => {
    expect(setXp({ reps: 8, weightKg: 100 }, 75, squat)).toBe(80); // 8 x 100 / 10
  });

  it("doesn't penalise bodyweight: a 0 kg pull-up still earns XP from your body", () => {
    expect(setXp({ reps: 8, weightKg: 0 }, 75, pullUp)).toBe(75); // 8 x (0 + 75) x 1.25 / 10
    expect(setXp({ reps: 8, weightKg: 10 }, 75, pullUp)).toBe(85); // added weight counts too
  });

  it("lifts light isolation work with its factor, so a hard set earns about as much as a squat set", () => {
    expect(setXp({ reps: 15, weightKg: 10 }, 75, lateralRaise)).toBe(75);
  });

  it("is relative to bodyweight: the same lift is worth more to a lighter player", () => {
    expect(setXp({ reps: 8, weightKg: 100 }, 80, squat)).toBe(75); // x 75/80
    // 40 kg at 60 kg bodyweight is the same effort as 60 kg at 90 kg: same XP.
    expect(setXp({ reps: 8, weightKg: 40 }, 60, bench)).toBe(50);
    expect(setXp({ reps: 8, weightKg: 60 }, 90, bench)).toBe(50);
  });

  it("gives a pure bodyweight exercise the same XP at any bodyweight", () => {
    for (const bodyweightKg of [50, 75, 80, 120]) {
      expect(setXp({ reps: 8, weightKg: 0 }, bodyweightKg, pullUp)).toBe(75);
    }
  });

  it("clamps the bodyweight to 40-200 kg", () => {
    expect(setXp({ reps: 8, weightKg: 100 }, 20, squat)).toBe(setXp({ reps: 8, weightKg: 100 }, 40, squat));
    expect(setXp({ reps: 8, weightKg: 100 }, 300, squat)).toBe(setXp({ reps: 8, weightKg: 100 }, 200, squat));
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

describe("bodyweightOnDate", () => {
  const entries = [
    { kg: 82, measuredOn: "2026-10-01" },
    { kg: 80, measuredOn: "2026-11-01" },
  ];

  it("uses the latest entry on or before the workout's date", () => {
    expect(bodyweightOnDate(entries, "2026-10-15T07:00:00.000Z")).toBe(82);
    expect(bodyweightOnDate(entries, "2026-11-01T18:00:00.000Z")).toBe(80);
  });

  it("uses the earliest entry for a workout before any entry, and 75 kg with none at all", () => {
    expect(bodyweightOnDate(entries, "2026-09-01T07:00:00.000Z")).toBe(82);
    expect(bodyweightOnDate([], "2026-09-01T07:00:00.000Z")).toBe(75);
  });
});

describe("xpBodyweightOnDate: a low bodyweight can't be typed in quickly", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const START = Date.parse("2026-01-05T08:00:00.000Z");
  const dayIso = (day: number) => new Date(START + day * DAY).toISOString();
  /** An entry typed on `day` (measured that day) and received by the server then. */
  const entry = (kg: number, day: number, receivedDay = day) => ({ kg, measuredOn: dayIso(day).slice(0, 10), receivedAt: dayIso(receivedDay) });

  it("takes the first entry as typed (clamped), and 75 kg with none", () => {
    expect(xpBodyweightOnDate([entry(62, 0)], dayIso(3))).toBe(62);
    expect(xpBodyweightOnDate([entry(35, 0)], dayIso(3))).toBe(BODYWEIGHT_XP.minKg);
    expect(xpBodyweightOnDate([], dayIso(3))).toBe(75);
  });

  it("leaves an honest slow loss untouched: 80 -> 72 kg over 10 weeks, entered weekly", () => {
    const weekly = Array.from({ length: 11 }, (_, week) => entry(80 - 0.8 * week, week * 7));
    for (let week = 0; week <= 10; week++) {
      expect(xpBodyweightOnDate(weekly, dayIso(week * 7 + 1))).toBeCloseTo(80 - 0.8 * week, 6);
    }
  });

  it("lets an infrequent update through in full: 5 kg lost over 8 weeks, entered once", () => {
    expect(xpBodyweightOnDate([entry(80, 0), entry(75, 56)], dayIso(57))).toBe(75);
  });

  it("barely moves on 80 -> 40 kg overnight", () => {
    const value = xpBodyweightOnDate([entry(80, 0), entry(40, 1)], dayIso(2));
    expect(value).toBeCloseTo(80 - 80 * BODYWEIGHT_XP.maxChangePerWeek / 7, 6); // about 79.77
  });

  it("applies an increase at once (bulking, or fixing a too-low typo)", () => {
    expect(xpBodyweightOnDate([entry(70, 0), entry(85, 1)], dayIso(2))).toBe(85);
  });

  it("gives a backdated entry no allowance: its gap is measured from when it was received", () => {
    // Entries on day 0 and day 56; then, on day 57, an entry of 40 kg backdated to day 1.
    const entries = [entry(80, 0), entry(80, 56), entry(40, 1, 57)];
    // A workout on day 2 uses the day-1 entry, limited by ONE day since the day-56 entry.
    expect(xpBodyweightOnDate(entries, dayIso(2))).toBeCloseTo(80 - 80 * BODYWEIGHT_XP.maxChangePerWeek / 7, 6);
    // Later workouts use the latest measured entry, as before.
    expect(xpBodyweightOnDate(entries, dayIso(60))).toBe(80);
  });

  it("treats a same-day re-entry as if it had been typed right the first time", () => {
    // 80 kg on day 0; on day 14, 78 kg, then corrected to 76 kg a few minutes later. The
    // correction replaces the day-14 entry (one entry per date), with a new receivedAt.
    const corrected = { ...entry(76, 14), receivedAt: new Date(START + 14 * DAY + 5 * 60 * 1000).toISOString() };
    const typedRightFirstTime = entry(76, 14);
    expect(xpBodyweightOnDate([entry(80, 0), corrected], dayIso(15))).toBeCloseTo(
      xpBodyweightOnDate([entry(80, 0), typedRightFirstTime], dayIso(15)),
      1,
    );
    // Two weeks allow 80 x 0.02 x 2 = 3.2 kg, so 76 kg lands at 76.8 for now (plus the
    // 5 minutes' worth), and catches up over the next week.
    expect(xpBodyweightOnDate([entry(80, 0), corrected], dayIso(15))).toBeCloseTo(76.8, 2);
  });

  it("doesn't let an edited first entry become unchecked: the edit moves to the end of the walk", () => {
    // Sign-up 80 kg (day 0), 80 kg again on day 28; on day 70 the sign-up entry is edited to 40.
    const edited = { ...entry(40, 0), receivedAt: dayIso(70) };
    const entries = [edited, entry(80, 28)];
    // The edited day-0 entry is limited by 6 weeks since day 28: 80 x (1 - 0.02 x 6) = 70.4.
    expect(xpBodyweightOnDate(entries, dayIso(1))).toBeCloseTo(70.4, 6);
    expect(xpBodyweightOnDate(entries, dayIso(71))).toBe(80);
  });
});
