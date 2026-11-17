import { describe, expect, it } from "vitest";
import {
  applyDailyCap,
  canBeRecord,
  DAILY_XP_CAP,
  DEFAULT_PLAUSIBILITY,
  EQUIPMENT,
  flagReasonText,
  HOLD_MAX_SEC,
  isTooOldForXp,
  judgeSession,
  jumpBaseline,
  jumpCappedXp,
  jumpCapText,
  jumpCheckValue,
  MECHANICS,
  plausibilityFlag,
  plausibilityLimits,
  repsMaxFor,
  WEIGHT_MAX_KG,
  XP_SOURCES_UNDER_DAILY_CAP,
} from "./index.js";

const machineCompound = { equipment: "machine", mechanic: "compound", repsUnit: "reps" } as const;

describe("plausibilityLimits", () => {
  it("uses the equipment x mechanic default when the exercise has no override", () => {
    expect(plausibilityLimits(machineCompound)).toEqual(DEFAULT_PLAUSIBILITY.machine.compound);
  });

  it("lets an exercise override either limit (a leg press moves more than a chest press)", () => {
    const legPress = { ...machineCompound, maxPlausibleWeightKg: 500, maxPlausibleReps: null };
    expect(plausibilityLimits(legPress)).toEqual({ maxWeightKg: 500, maxReps: DEFAULT_PLAUSIBILITY.machine.compound.maxReps });
  });

  it("never flags a timed exercise for duration: its limit is the hard 600 s", () => {
    const plank = { equipment: "bodyweight", mechanic: "isolation", repsUnit: "seconds", maxPlausibleReps: 30 } as const;
    expect(plausibilityLimits(plank).maxReps).toBe(HOLD_MAX_SEC);
  });

  it("keeps every default inside the hard limits, so it can actually be reached", () => {
    for (const equipment of EQUIPMENT) {
      for (const mechanic of MECHANICS) {
        const limits = DEFAULT_PLAUSIBILITY[equipment][mechanic];
        expect(limits.maxWeightKg).toBeLessThanOrEqual(WEIGHT_MAX_KG);
        expect(limits.maxReps).toBeLessThanOrEqual(repsMaxFor("reps"));
      }
    }
  });
});

describe("plausibilityFlag", () => {
  const limits = { maxWeightKg: 300, maxReps: 60 };

  it("accepts the limits themselves", () => {
    expect(plausibilityFlag({ reps: 60, weightKg: 300 }, limits)).toBeNull();
  });

  it("flags weight above the limit, and reps above the limit", () => {
    expect(plausibilityFlag({ reps: 8, weightKg: 300.5 }, limits)).toBe("weight_above_range");
    expect(plausibilityFlag({ reps: 61, weightKg: 100 }, limits)).toBe("reps_above_range");
  });

  it("reports the weight when both are over", () => {
    expect(plausibilityFlag({ reps: 90, weightKg: 400 }, limits)).toBe("weight_above_range");
  });
});

describe("flagReasonText", () => {
  const limits = { maxWeightKg: 50, maxReps: 60 };

  it("names the weight and the limit in the player's unit", () => {
    expect(flagReasonText("weight_above_range", { reps: 12, weightKg: 300 }, limits, "kg")).toBe(
      "300 kg is above the 50 kg limit for this exercise, so this set earns no XP and doesn't count as a PR.",
    );
    expect(flagReasonText("weight_above_range", { reps: 12, weightKg: 300 }, limits, "lb")).toContain("661.39 lb is above the 110.23 lb limit");
  });

  it("names the reps and the limit", () => {
    expect(flagReasonText("reps_above_range", { reps: 90, weightKg: 10 }, limits, "kg")).toBe(
      "90 reps is above the 60-rep limit for this exercise, so this set earns no XP and doesn't count as a PR.",
    );
  });
});

describe("jump cap: estimated 1RM (Epley) at every rep count, or seconds for timed exercises", () => {
  const e1rm = (kg: number, reps: number) => jumpCheckValue({ reps, loadKg: kg }, "reps");

  it("uses Epley at any rep count, and a single rep is the weight lifted", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 5)).toBeCloseTo(116.67, 2);
    expect(e1rm(60, 20)).toBeCloseTo(100, 6);
    expect(jumpCheckValue({ reps: 90, loadKg: 37.5 }, "seconds")).toBe(90); // a hold compares seconds
  });

  it("does NOT cap an honest switch of rep range: best 100 kg x 5, then 60 kg x 20", () => {
    // Volume would call this a jump (500 -> 1,200); estimated 1RM shows it's lighter work.
    const baseline = jumpBaseline([[e1rm(100, 5)]]);
    expect(judgeSession(baseline, [e1rm(60, 20)])).toMatchObject({ factors: [1], aboveHistory: [false] });
  });

  it("caps 60 kg x 8 followed by 60 kg x 80", () => {
    const baseline = jumpBaseline([[e1rm(60, 8)]])!; // 76 kg
    const judged = judgeSession(baseline, [e1rm(60, 80)]); // 220 kg "estimated"

    expect(judged.aboveHistory).toEqual([true]);
    expect(judged.factors[0]).toBeCloseTo((76 * 1.25) / 220, 6); // XP as if exactly at the 95 kg line
    expect(jumpCappedXp(100, judged.factors[0]!)).toBe(43);
  });

  it("applies only the absolute limits in the first session (and when the best so far is 0)", () => {
    expect(judgeSession(null, [500])).toEqual({ factors: [1], aboveHistory: [false], baselineAfter: 500 });
    expect(judgeSession(0, [80])).toEqual({ factors: [1], aboveHistory: [false], baselineAfter: 80 });
  });

  it("keeps the baseline fixed within a session: five sets can't each climb 25%", () => {
    const judged = judgeSession(100, [126, 126, 156, 120]);
    expect(judged.aboveHistory).toEqual([true, true, true, false]);
    expect(judged.baselineAfter).toBe(125); // moves only to the line, not to 156
  });

  it("lets a lifter who really got stronger catch up within a few sessions", () => {
    // Best 60 kg estimated, then genuinely 100 kg every session from now on.
    let baseline: number | null = 60;
    const capped: boolean[] = [];
    for (let session = 0; session < 4; session++) {
      const judged = judgeSession(baseline, [100]);
      capped.push(judged.aboveHistory[0]!);
      baseline = judged.baselineAfter;
    }
    expect(capped).toEqual([true, true, false, false]); // 60 -> 75 -> 93.75 -> 100
  });

  it("compares a timed exercise with the longest hold", () => {
    const judged = judgeSession(jumpBaseline([[60, 45]]), [90]);
    expect(judged.factors[0]).toBeCloseTo(75 / 90, 6);
  });

  it("explains a capped set with the best and the line, in the player's unit", () => {
    expect(jumpCapText(100, "reps", "kg")).toBe(
      "Far above your best for this exercise (estimated 1RM 100 kg), so it earns XP as 125 kg for now and doesn't count as a PR. Keep it up: the full value catches up within a few sessions.",
    );
    expect(jumpCapText(60, "seconds", "kg")).toContain("(longest hold 60 s), so it earns XP as 75 s");
  });
});

describe("applyDailyCap: full XP to 3,100, 25% beyond, never more than 6,200 a day", () => {
  it("uses the limit chosen with the simulation", () => {
    expect(DAILY_XP_CAP).toEqual({ limit: 3100, bandRate: 0.25, ceilingMultiple: 2 });
  });

  it("leaves a normal day alone", () => {
    expect(applyDailyCap(0, [60, 60, 60])).toEqual({ awarded: [60, 60, 60], heldBack: 0 });
    expect(applyDailyCap(3000, [100])).toEqual({ awarded: [100], heldBack: 0 }); // lands exactly on the limit
  });

  it("splits a set that crosses the limit: full rate up to 3,100, 25% for the rest", () => {
    // 100 of 200 fit under the limit; the other 100 earn 25.
    expect(applyDailyCap(3000, [200])).toEqual({ awarded: [125], heldBack: 75 });
  });

  it("pays 25% for a set entirely in the band", () => {
    expect(applyDailyCap(3200, [100])).toEqual({ awarded: [25], heldBack: 75 });
  });

  it("stops at the ceiling: a set crossing it earns only the room left", () => {
    expect(applyDailyCap(6190, [100])).toEqual({ awarded: [10], heldBack: 90 }); // 25 would pass 6,200
    expect(applyDailyCap(6190, [40])).toEqual({ awarded: [10], heldBack: 30 }); // 25% of 40 = 10 fits exactly
  });

  it("awards nothing once the day is at (or somehow past) the ceiling", () => {
    expect(applyDailyCap(6200, [80, 80])).toEqual({ awarded: [0, 0], heldBack: 160 });
    expect(applyDailyCap(7000, [80])).toEqual({ awarded: [0], heldBack: 80 });
  });

  it("carries the day's total from set to set, in order", () => {
    // 3,050 before: set 1 fills the last 50 (+25 for its other 100); set 2 is all in the band.
    expect(applyDailyCap(3050, [150, 100, 0])).toEqual({ awarded: [75, 25, 0], heldBack: 150 });
  });

  it("rounds each set's 25% like set XP (a 1 XP set in the band earns 0)", () => {
    expect(applyDailyCap(3600, [1, 2, 3])).toEqual({ awarded: [0, 1, 1], heldBack: 4 });
  });

  it("reaches the ceiling only after about 15,500 raw XP in a day", () => {
    const { awarded } = applyDailyCap(0, Array.from({ length: 155 }, () => 100));
    expect(awarded.reduce((a, b) => a + b, 0)).toBe(DAILY_XP_CAP.limit * DAILY_XP_CAP.ceilingMultiple);
    expect(applyDailyCap(0, Array.from({ length: 154 }, () => 100)).awarded.reduce((a, b) => a + b, 0)).toBeLessThan(6200);
  });

  it("covers set XP only: weekly and streak bonuses are outside it", () => {
    expect(XP_SOURCES_UNDER_DAILY_CAP).toEqual(["workout_set"]);
  });
});

describe("isTooOldForXp: a workout synced more than 14 days after it started earns no XP", () => {
  const started = "2026-11-01T18:00:00.000Z";
  const plus = (ms: number) => new Date(Date.parse(started) + ms).toISOString();
  const DAY = 24 * 60 * 60 * 1000;

  it("still earns at exactly 14 days, not a millisecond later", () => {
    expect(isTooOldForXp(started, plus(14 * DAY))).toBe(false);
    expect(isTooOldForXp(started, plus(14 * DAY + 1))).toBe(true);
  });

  it("earns for a normal sync, and for one a few days late", () => {
    expect(isTooOldForXp(started, plus(70 * 60 * 1000))).toBe(false);
    expect(isTooOldForXp(started, plus(2 * DAY))).toBe(false);
  });
});

describe("canBeRecord", () => {
  it("leaves out implausible and jump-capped sets, and only those", () => {
    expect(canBeRecord({ isFlagged: false, flagReason: null })).toBe(true);
    expect(canBeRecord({ flagReason: null })).toBe(true);
    expect(canBeRecord({ isFlagged: true, flagReason: "weight_above_range" })).toBe(false);
    expect(canBeRecord({ isFlagged: false, flagReason: "above_history" })).toBe(false);
  });
});
