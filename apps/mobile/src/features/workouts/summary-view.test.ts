import { xpForLevel } from "@levelup/shared";
import { benchPress, plank, pullUp, sequentialIds } from "@/test/fixtures";
import { addExercise, startWorkout, toggleSetDone, updateSet } from "./active-workout";
import { compareCount, compareDuration, compareVolume, levelBar, prHeading, prLine, previewSummary, volumeText } from "./summary-view";

describe("comparisons with last time", () => {
  it("says how much faster or longer, within a minute counting as the same", () => {
    expect(compareDuration(58 * 60 + 40, 61 * 60 + 40)).toEqual({ text: "3 min faster", better: false });
    expect(compareDuration(3600, 3550)).toEqual({ text: "Same as last", better: false });
    expect(compareDuration(3600, null)).toBeNull();
  });

  it("counts sets", () => {
    expect([compareCount(18, 16), compareCount(15, 16), compareCount(18, 18)].map((c) => c?.text)).toEqual(["+2 vs last", "−1 vs last", "Same as last"]);
  });

  it("gives volume as a percentage, green when it went up", () => {
    expect(compareVolume(7420, 7135)).toEqual({ text: "+4% vs last", better: true });
    expect(compareVolume(7000, 7420)).toEqual({ text: "−6% vs last", better: false });
    expect(compareVolume(100, 0)).toBeNull();
  });

  it("shows volume in the player's unit", () => {
    expect([volumeText(7420, "kg"), volumeText(1000, "lb")]).toEqual(["7,420", "2,205"]);
  });
});

describe("levelBar", () => {
  it("splits the bar into XP you had (purple) and XP this workout added (ice)", () => {
    const start = xpForLevel(5); // 800
    const bar = levelBar(start + 100, start + 300);
    const span = xpForLevel(6) - start;

    expect(bar).toMatchObject({ level: 5, leveledUp: false, toNextText: `${(xpForLevel(6) - start - 300).toLocaleString("en-US")} XP to level 6` });
    expect(bar.before).toBeCloseTo(100 / span);
    expect(bar.gained).toBeCloseTo(200 / span);
  });

  it("counts everything in a new level as this workout's gain", () => {
    const bar = levelBar(xpForLevel(2) - 10, xpForLevel(2) + 40);
    expect(bar).toMatchObject({ level: 2, leveledUp: true, before: 0 });
  });
});

describe("PR lines", () => {
  const set = { reps: 6, weightKg: 65 };

  it("describes an estimated 1RM PR with the set that set it, in the player's unit", () => {
    expect(prLine({ exerciseId: benchPress.id, exerciseName: "Bench Press", kind: "e1rm", value: 78, previousValue: 76, set }, benchPress, "kg")).toEqual({
      detail: "65 kg × 6 · est. 1RM",
      value: "78 kg",
      was: "was 76",
    });
  });

  it("describes reps at a weight and a longest hold", () => {
    expect(prLine({ exerciseId: pullUp.id, exerciseName: "Pull-up", kind: "reps_at_weight", value: 14, previousValue: 12, set: { reps: 14, weightKg: 0 } }, pullUp, "kg")).toEqual({
      detail: "Most reps at BW",
      value: "14 reps",
      was: "was 12",
    });
    expect(prLine({ exerciseId: plank.id, exerciseName: "Plank", kind: "longest_hold", value: 75, previousValue: 60, set: { reps: 75, weightKg: 0 } }, plank, "kg").value).toBe("75 s");
  });

  it("counts them in the heading", () => {
    expect([prHeading(1), prHeading(2)]).toEqual(["1 new personal record", "2 new personal records"]);
  });
});

describe("previewSummary (before the workout syncs)", () => {
  it("works out XP for sets, duration, sets and volume on the phone", () => {
    const START = new Date("2026-11-10T06:00:00.000Z");
    let w = addExercise(startWorkout({ userId: "u", clientId: "c", now: START, weightUnit: "kg" }), benchPress, sequentialIds());
    const e = w.exercises[0]!;
    w = updateSet(w, e.id, e.sets[0]!.id, { weight: "60", reps: "8" });
    const ticked = toggleSetDone(w, e.id, e.sets[0]!.id, new Date(START.getTime() + 600_000));
    if (!ticked.ok) throw new Error(ticked.message);

    expect(previewSummary(ticked.value, new Date(START.getTime() + 3_600_000).toISOString(), 80)).toEqual({
      xpSets: 56, // round(8 x 60 x 1.25 x 75/80 / 10): XP is relative to bodyweight
      durationSec: 3600,
      setCount: 1,
      volumeKg: 480, // volume stays in real kilograms
    });
  });
});
