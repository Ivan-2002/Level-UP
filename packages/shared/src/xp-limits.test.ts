import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAUSIBILITY,
  EQUIPMENT,
  flagReasonText,
  HOLD_MAX_SEC,
  MECHANICS,
  plausibilityFlag,
  plausibilityLimits,
  repsMaxFor,
  WEIGHT_MAX_KG,
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
