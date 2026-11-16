import { describe, expect, it } from "vitest";
import {
  coachAdvice,
  coachHintText,
  coachIncrementsKg,
  formatWeight,
  fromInputWeight,
  toDisplayWeight,
  KG_PER_LB,
} from "./index.js";

const roundTrip = (value: number, unit: "kg" | "lb") => toDisplayWeight(fromInputWeight(value, unit), unit);

describe("lb round trip: what you type is what you see", () => {
  it.each([45, 135, 225, 315, 405, 2.5, 7.5, 12.5, 46.25, 1.25, 0.5])("%s lb", (lb) => {
    expect(roundTrip(lb, "lb")).toBe(lb);
  });

  it("is exact for EVERY 2.5 lb step from 0 to 1,100 lb (the 500 kg limit)", () => {
    const wrong: number[] = [];
    for (let lb = 0; lb <= 1100; lb += 2.5) if (roundTrip(lb, "lb") !== lb) wrong.push(lb);
    expect(wrong).toEqual([]);
  });

  it("is exact for every 0.25 lb step up to 100 lb (microplates)", () => {
    const wrong: number[] = [];
    for (let quarters = 0; quarters <= 400; quarters++) {
      const lb = quarters / 4;
      if (roundTrip(lb, "lb") !== lb) wrong.push(lb);
    }
    expect(wrong).toEqual([]);
  });

  it("stores 135 lb as 61.235 kg (3 decimals, like the database column)", () => {
    expect(fromInputWeight(135, "lb")).toBe(61.235);
    expect(135 * KG_PER_LB).toBeCloseTo(61.23497, 5); // the exact value has more decimals
  });

  it("would NOT be exact with only 2 decimals: why the columns are DECIMAL(7,3)", () => {
    const twoDecimalRoundTrip = (lb: number) => Math.round((Math.round(lb * KG_PER_LB * 100) / 100 / KG_PER_LB) * 100) / 100;
    const wrong: number[] = [];
    for (let quarters = 0; quarters <= 400; quarters++) {
      const lb = quarters / 4;
      if (twoDecimalRoundTrip(lb) !== lb) wrong.push(lb);
    }
    expect(wrong.length).toBe(216); // more than half of the 401 quarter-pound values
    expect(wrong).toEqual(expect.arrayContaining([1.25, 2.5])); // even common plates
    expect(twoDecimalRoundTrip(135)).toBe(134.99); // the bug 3 decimals prevents
  });
});

describe("kg round trip", () => {
  it.each([20, 60, 62.5, 100, 102.5, 1.25, 0.5, 500])("%s kg", (kg) => {
    expect(roundTrip(kg, "kg")).toBe(kg);
  });

  it("is exact for every 0.25 kg step up to 500 kg", () => {
    const wrong: number[] = [];
    for (let quarters = 0; quarters <= 2000; quarters++) {
      const kg = quarters / 4;
      if (roundTrip(kg, "kg") !== kg) wrong.push(kg);
    }
    expect(wrong).toEqual([]);
  });
});

describe("formatWeight", () => {
  it("shows the player's unit without trailing zeros", () => {
    expect(formatWeight(62.5, "kg")).toBe("62.5 kg");
    expect(formatWeight(60, "kg")).toBe("60 kg");
    expect(formatWeight(fromInputWeight(135, "lb"), "lb")).toBe("135 lb");
    expect(formatWeight(fromInputWeight(46.25, "lb"), "lb")).toBe("46.25 lb");
  });

  it("shows bodyweight sets as BW, or BW + the added weight", () => {
    expect(formatWeight(0, "kg", { bodyweight: true })).toBe("BW");
    expect(formatWeight(10, "kg", { bodyweight: true })).toBe("BW + 10 kg");
    expect(formatWeight(fromInputWeight(25, "lb"), "lb", { bodyweight: true })).toBe("BW + 25 lb");
  });

  it("can show fewer decimals for derived numbers like an estimated 1RM", () => {
    expect(formatWeight(76.04, "kg", { decimals: 1 })).toBe("76 kg");
    expect(formatWeight(76, "lb", { decimals: 1 })).toBe("167.6 lb");
  });
});

describe("coach increments follow the player's unit", () => {
  const eightsAt = (kg: number) => [8, 8, 8].map((reps) => ({ reps, weightKg: kg }));

  it("tells a lb player 135 -> 140 lb, not +2.5 kg", () => {
    const advice = coachAdvice({
      equipment: "barbell",
      repsUnit: "reps",
      weightUnit: "lb",
      lastSets: eightsAt(fromInputWeight(135, "lb")),
      targetReps: 8,
    });

    expect(toDisplayWeight(advice.kind === "increase_weight" ? advice.weightKg : 0, "lb")).toBe(140);
    expect(coachHintText(advice, "reps", "lb")).toBe("You hit 8, 8, 8 at 135 lb last time, so today's target is 140 lb.");
  });

  it("adds 5 lb per dumbbell for lb players, 1 kg for kg players", () => {
    const lb = coachAdvice({ equipment: "dumbbell", repsUnit: "reps", weightUnit: "lb", lastSets: eightsAt(fromInputWeight(50, "lb")), targetReps: 8 });
    const kg = coachAdvice({ equipment: "dumbbell", repsUnit: "reps", weightUnit: "kg", lastSets: eightsAt(22), targetReps: 8 });

    expect(coachHintText(lb, "reps", "lb")).toContain("today's target is 55 lb");
    expect(coachHintText(kg, "reps", "kg")).toContain("today's target is 23 kg");
  });

  it("keeps kg players on the Phase 2 defaults", () => {
    expect(coachIncrementsKg("kg")).toEqual({ barbell: 2.5, machine: 2.5, cable: 2.5, dumbbell: 1, kettlebell: 4, bodyweight: null });
    expect(coachIncrementsKg("lb").barbell).toBe(2.268); // 5 lb in kg, 3 decimals
  });
});
