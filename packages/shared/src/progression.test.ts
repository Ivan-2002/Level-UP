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
  setEffort,
  setXp,
  volumeKg,
  xpBodyweightOnDate,
  DEFAULT_INCREMENTS,
} from "./index.js";

const squat = { loadFactor: 1.0, bodyweightRatio: 0, repsUnit: "reps" } as const;
const pullUp = { loadFactor: 1.25, bodyweightRatio: 1.0, repsUnit: "reps" } as const;
const lateralRaise = { loadFactor: 5.0, bodyweightRatio: 0, repsUnit: "reps" } as const;
const bench = { loadFactor: 1.25, bodyweightRatio: 0, repsUnit: "reps" } as const;
const plank = { loadFactor: 0.35, bodyweightRatio: 0.5, repsUnit: "seconds" } as const;

describe("setXp (formula C): K x estimated 1RM of the XP load x effort", () => {
  // At the 75 kg reference the bodyweight factor is 1, which keeps the arithmetic readable.
  it("rates a set by its estimated 1RM: 8 x 100 kg = 126.7 kg, x 0.73 = 92 XP", () => {
    expect(setXp({ reps: 8, weightKg: 100 }, 75, squat)).toBe(92);
  });

  it("pays every hard set about the same, whatever the rep range (1RM 125 kg)", () => {
    const sets = [
      [5, 108.75], // 87%
      [10, 93.75], // 75%
      [20, 71.875], // 57.5%
      [30, 62.5], // 50%
    ].map(([reps, weightKg]) => setXp({ reps: reps!, weightKg: weightKg! }, 75, squat));
    expect(sets).toEqual([93, 91, 87, 91]); // the old reps x load gave 54, 94, 144, 188
  });

  it("scales by effort: a warm-up single earns a fraction of its estimated 1RM", () => {
    expect(setXp({ reps: 1, weightKg: 60 }, 75, squat, 1)).toBe(44);
    expect(setXp({ reps: 1, weightKg: 60 }, 75, squat, 0.03)).toBe(1);
  });

  it("doesn't penalise bodyweight: a 0 kg pull-up still earns XP from your body", () => {
    expect(setXp({ reps: 8, weightKg: 0 }, 75, pullUp)).toBe(87); // 75 x 1.25 = 93.75 kg, x 1.267 x 0.73
    expect(setXp({ reps: 8, weightKg: 10 }, 75, pullUp)).toBeGreaterThan(87); // added weight counts too
  });

  it("lifts light isolation work with its factor, so a hard set earns about as much as a squat set", () => {
    expect(setXp({ reps: 15, weightKg: 10 }, 75, lateralRaise)).toBe(55);
  });

  it("softens the bodyweight factor with a square root", () => {
    expect(setXp({ reps: 8, weightKg: 100 }, 80, squat)).toBe(90); // load x sqrt(75/80)
    // Benching two-thirds of your bodyweight: the lighter player earns sqrt(60/90) = 0.82 of the heavier.
    const light = setXp({ reps: 8, weightKg: 40 }, 60, bench);
    const heavy = setXp({ reps: 8, weightKg: 60 }, 90, bench);
    expect(light / heavy).toBeCloseTo(Math.sqrt(60 / 90), 1);
  });

  it("gives a heavier player a little more for the same bodyweight exercise", () => {
    expect([60, 75, 120].map((bw) => setXp({ reps: 8, weightKg: 0 }, bw, pullUp))).toEqual([78, 87, 110]);
  });

  it("clamps the bodyweight to 40-200 kg", () => {
    expect(setXp({ reps: 8, weightKg: 100 }, 20, squat)).toBe(setXp({ reps: 8, weightKg: 100 }, 40, squat));
    expect(setXp({ reps: 8, weightKg: 100 }, 300, squat)).toBe(setXp({ reps: 8, weightKg: 100 }, 200, squat));
  });

  it("pays timed exercises by volume, counting at most 120 seconds", () => {
    expect(setXp({ reps: 60, weightKg: 0 }, 75, plank)).toBe(79); // 60 s x 37.5 kg x 0.35 / 10
    expect(setXp({ reps: 120, weightKg: 0 }, 75, plank)).toBe(158);
    expect(setXp({ reps: 600, weightKg: 0 }, 75, plank)).toBe(158);
  });
});

describe("setEffort: how close to failure", () => {
  const best = 100 * (1 + 8 / 30); // 126.7 kg: a best of 100 kg x 8

  it("is 1 for a set within 3 reps of failure, and at or above the best", () => {
    expect(setEffort(8, 100, best)).toBe(1);
    expect(setEffort(5, 100, best)).toBe(1); // 3 short
    expect(setEffort(1, 130, best)).toBe(1);
  });

  it("drops below 1 further from failure", () => {
    expect(setEffort(4, 100, best)).toBeCloseTo(0.8, 6); // 4 short: 4 of a countable 5
  });

  it("makes warm-ups and easy sets nearly worthless", () => {
    expect(setEffort(1, 60, best)).toBeCloseTo(0.033, 3);
    expect(setEffort(10, 50, best)).toBeCloseTo(0.23, 2);
  });

  it("is 1 with nothing to compare with", () => {
    expect(setEffort(3, 60, null)).toBe(1);
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

  it("limits increases the same way: 75 -> 200 kg overnight barely moves", () => {
    const value = xpBodyweightOnDate([entry(75, 0), entry(200, 1)], dayIso(2));
    expect(value).toBeCloseTo(75 + 75 * BODYWEIGHT_XP.maxChangePerWeek / 7, 6); // about 75.2
  });

  it("leaves an honest bulk untouched: 70 -> 74 kg over 10 weeks, entered weekly", () => {
    const weekly = Array.from({ length: 11 }, (_, week) => entry(70 + 0.4 * week, week * 7));
    expect(xpBodyweightOnDate(weekly, dayIso(71))).toBeCloseTo(74, 6);
  });

  it("gives a backdated entry no allowance: its gap is measured from when it was received", () => {
    // Entries on day 0 and day 56; then, on day 57, an entry of 40 kg backdated to day 1.
    const entries = [entry(80, 0), entry(80, 56), entry(40, 1, 57)];
    // A workout on day 2 uses the day-1 entry, limited by ONE day since the day-56 entry.
    expect(xpBodyweightOnDate(entries, dayIso(2))).toBeCloseTo(80 - 80 * BODYWEIGHT_XP.maxChangePerWeek / 7, 6);
    // Later workouts use the latest measured entry, as before.
    expect(xpBodyweightOnDate(entries, dayIso(60))).toBe(80);
  });

  it("counts a same-day correction as a change: it catches up within the allowance", () => {
    // 80 kg on day 0; on day 14, 78 kg, then corrected to 76 kg five minutes later. Both
    // writes are receipts: the 78 used the two weeks' allowance, the 76 has five minutes'.
    const corrected = [entry(80, 0), entry(78, 14), { ...entry(76, 14), receivedAt: new Date(START + 14 * DAY + 5 * 60 * 1000).toISOString() }];
    expect(xpBodyweightOnDate(corrected, dayIso(15))).toBeCloseTo(78, 2);
    // A week later the next entry catches up in full (78 x 0.02 = 1.56 kg allowed, 2 needed: 76.44).
    expect(xpBodyweightOnDate([...corrected, entry(76, 21)], dayIso(22))).toBeCloseTo(78 - 78 * BODYWEIGHT_XP.maxChangePerWeek, 2);
  });

  it("can't be reset by re-entering every date: the original receipts stay in the walk", () => {
    // 80 kg on days 0 and 7; on day 8, both dates are re-entered as 40 kg.
    const original = [entry(80, 0), entry(80, 7)];
    const reEntered = [entry(40, 0, 8), { ...entry(40, 7), receivedAt: new Date(START + 8 * DAY + 60 * 1000).toISOString() }];
    // With only the current entry per date (the old rule's input), the first edit was an
    // unchecked first entry, and 40 kg went through:
    expect(xpBodyweightOnDate(reEntered, dayIso(8))).toBe(40);
    // With every receipt, 80 -> 40 kg moves only one day's allowance:
    expect(xpBodyweightOnDate([...original, ...reEntered], dayIso(8))).toBeCloseTo(80 - 80 * BODYWEIGHT_XP.maxChangePerWeek / 7, 2);
  });

  it("takes every receipt in the first week after sign-up as typed: a mistyped first weight is corrected at once", () => {
    const signedUpAt = dayIso(0);
    // Signed up at 120 kg (meant 80); corrected on day 2.
    const receipts = [entry(120, 0), entry(80, 2)];
    expect(xpBodyweightOnDate(receipts, dayIso(3), { signedUpAt })).toBe(80);
    // Without the grace week the correction would move one 2-day allowance: about 119.3.
    expect(xpBodyweightOnDate(receipts, dayIso(3))).toBeCloseTo(120 - 120 * BODYWEIGHT_XP.maxChangePerWeek * (2 / 7), 6);
  });

  it("checks receipts again from day 7: the limit starts at the latest receipt of the grace week", () => {
    const signedUpAt = dayIso(0);
    const receipts = [entry(120, 0), entry(80, 6), entry(40, 8)];
    // Day 8 is past the grace week: 80 -> 40 moves two days' allowance from the day-6 receipt.
    expect(xpBodyweightOnDate(receipts, dayIso(9), { signedUpAt })).toBeCloseTo(80 - 80 * BODYWEIGHT_XP.maxChangePerWeek * (2 / 7), 6);
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
