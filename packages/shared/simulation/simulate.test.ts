import { describe, expect, it } from "vitest";
import { WEEKLY_GOAL } from "../src/weekly-goal.js";
import type { SimPlayer } from "./players.js";
import { sessionSetXp, simulate } from "./simulate.js";

// The simulation's numbers end up in the decision log, so the simulation itself is tested:
// small players whose results can be worked out by hand.

const squat = (kg: number) => [{ slug: "barbell-back-squat" as const, sets: 1, reps: 8, kg }];

// At the 75 kg reference the bodyweight factor is 1, which keeps the arithmetic readable.
describe("sessionSetXp", () => {
  it("uses the shared set formula: 8 x 100 kg back squat (load factor 1) = 80 XP", () => {
    expect(sessionSetXp(squat(100), 1, 75)).toBe(80);
    expect(sessionSetXp(squat(100), 1, 80)).toBe(75); // relative to bodyweight: x 75/80
  });

  it("grows loaded lifts by weight and bodyweight moves by reps", () => {
    expect(sessionSetXp(squat(100), 1.1, 75)).toBe(88); // 110 kg x 8 / 10
    // Pull-up: 8 reps -> 10 at 1.25x strength; 10 x 75 kg x load factor 1.25 / 10 = 93.75.
    expect(sessionSetXp([{ slug: "pull-up", sets: 1, reps: 8, kg: 0 }], 1.25, 75)).toBe(94);
  });
});

describe("simulate", () => {
  const twiceAWeek: SimPlayer = {
    name: "test",
    bodyweightKg: 75,
    trainingDays: [0, 3],
    sessions: [squat(100)],
    growth: { perWeek: 0, max: 1 },
  };

  it("pays the weekly goal through the real rules", () => {
    const result = simulate(twiceAWeek, 2);

    // Week 1: 2 days meets the target of 2 (bonus). Under the 4c rule that raises the
    // target to 3, so week 2's 2 days miss it: no bonus, and the streak resets.
    expect(result.setXp).toBe(4 * 80);
    expect(result.bonusXp).toBe(WEEKLY_GOAL.weeklyBonusXp);
    expect(result.longestStreak).toBe(1);
  });

  it("records the session and day each level is reached", () => {
    const result = simulate(twiceAWeek, 2);

    // Level 2 needs 100 XP: session 1 earns 80 (not enough); session 2 (Thursday, day 3)
    // brings 160 + the weekly bonus.
    expect(result.reached[2]).toEqual({ session: 1, day: 3 });
  });

  it("limits a fake bodyweight drop with the XP bodyweight rule", () => {
    const honest = simulate({ ...twiceAWeek, bodyweightKg: 80 }, 1);
    const faker = simulate({ ...twiceAWeek, bodyweightKg: 80, typedBodyweight: (week) => (week === 0 ? 80 : 40) }, 2);
    // Week 1 is identical (the 40 kg entry arrives in week 2); in week 2 the faker's XP
    // bodyweight has moved only 2% (80 -> 78.4 kg), not halved: 2 x 75 x 80/78.4 = 2 x 77.
    expect(faker.firstWeekSessionXp).toEqual(honest.firstWeekSessionXp);
    expect(faker.setXp - honest.setXp).toBe(2 * 77);
  });

  it("is deterministic", () => {
    expect(simulate(twiceAWeek, 10)).toEqual(simulate(twiceAWeek, 10));
  });
});
