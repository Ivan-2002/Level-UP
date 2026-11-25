import { describe, expect, it } from "vitest";
import { setXp } from "../src/progression.js";
import { WEEKLY_GOAL } from "../src/weekly-goal.js";
import { applyDailyCap, JUMP_CAP } from "../src/xp-limits.js";
import { SIM_EXERCISES } from "./exercises.js";
import { SIM_PLAYERS, type PlannedExercise, type SimPlayer } from "./players.js";
import { sessionSetXp, simulate } from "./simulate.js";
import { decayRow, developmentPlayers, developmentRows, returningLegs } from "./development.js";

// The simulation's numbers end up in the decision log, so the simulation itself is tested.
// Expected values come from the shared rules (setXp, applyDailyCap), not re-done by hand:
// these tests check that the simulation PLAYS the rules correctly, not what they're worth.

const SQUAT = SIM_EXERCISES["barbell-back-squat"];
const sets = (
  n: number,
  reps: number,
  kg: number,
  slug: PlannedExercise["slug"] = "barbell-back-squat",
): PlannedExercise => ({ slug, sets: n, reps, kg });
const squat = (kg: number) => [sets(1, 8, kg)];
const xp = (reps: number, weightKg: number, bodyweightKg = 75, exercise = SQUAT) =>
  setXp({ reps, weightKg }, bodyweightKg, exercise);

describe("sessionSetXp", () => {
  it("uses the shared set formula", () => {
    expect(sessionSetXp(squat(100), 1, 75)).toBe(xp(8, 100));
    expect(sessionSetXp(squat(100), 1, 80)).toBe(xp(8, 100, 80));
  });

  it("grows loaded lifts by weight and bodyweight moves by reps", () => {
    expect(sessionSetXp(squat(100), 1.1, 75)).toBe(xp(8, 110));
    expect(sessionSetXp([sets(1, 8, 0, "pull-up")], 1.25, 75)).toBe(xp(10, 0, 75, SIM_EXERCISES["pull-up"]));
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
    // 3 sets a session: a 1-set session isn't a training day (qualifiesAsTrainingDay).
    const result = simulate({ ...twiceAWeek, sessions: [[sets(3, 8, 100)]] }, 2);

    // 2 days meets the target of 2 each week. Meeting it exactly keeps it at 2 (it rises
    // only when beaten), so both weeks pay and the streak reaches 2.
    expect(result.setXp).toBe(4 * 3 * xp(8, 100));
    expect(result.bonusXp).toBe(2 * WEEKLY_GOAL.weeklyBonusXp);
    expect(result.longestStreak).toBe(2);
  });

  it("records the session and day each level is reached", () => {
    // 3 sets a session: session 1 alone is below level 2 (400 XP); session 2 (Thursday, day 3) passes it.
    const result = simulate({ ...twiceAWeek, sessions: [[sets(3, 8, 100)]] }, 2);
    expect(3 * xp(8, 100)).toBeLessThan(400);
    expect(result.reached[2]).toEqual({ session: 1, day: 3 });
  });

  it("limits a fake bodyweight drop with the XP bodyweight rule", () => {
    const honest = simulate({ ...twiceAWeek, bodyweightKg: 80 }, 2);
    const faker = simulate({ ...twiceAWeek, bodyweightKg: 80, typedBodyweight: (week) => (week === 0 ? 80 : 40) }, 2);
    // Week 1 is identical; in week 2 the faker's XP bodyweight has moved only 2% (80 -> 78.4 kg).
    expect(faker.firstWeekSessionXp).toEqual(honest.firstWeekSessionXp);
    expect(faker.setXp - honest.setXp).toBe(2 * (xp(8, 100, 78.4) - xp(8, 100, 80)));
  });

  it("applies the plausibility limits: an implausible set earns nothing", () => {
    // 460 kg is above the back squat's own limit (450, overriding the barbell compound 350).
    const result = simulate({ ...twiceAWeek, sessions: [squat(460)] }, 1);
    expect(result).toMatchObject({ flaggedSets: 2, setXp: 0 });
  });

  it("applies the jump cap per exercise against earlier sessions", () => {
    // 8 x 60 kg, then 8 x 100 kg: estimated 1RM 76 -> 126.7 kg, above the 95 kg line.
    const jumper = simulate({ ...twiceAWeek, sessions: [squat(60), squat(100)] }, 1);
    const line = 60 * (1 + 8 / 30) * (1 + JUMP_CAP.maxJump);
    expect(jumper.jumpCappedSets).toBe(1);
    expect(jumper.setXp).toBe(xp(8, 60) + Math.round(xp(8, 100) * (line / (100 * (1 + 8 / 30)))));
  });

  it("gives no XP beyond 10 sets of one exercise in a session", () => {
    const result = simulate({ ...twiceAWeek, trainingDays: [0], sessions: [[sets(12, 8, 100)]] }, 1);
    expect(result).toMatchObject({ beyondLimitSets: 2, setXp: 10 * xp(8, 100) });
  });

  it("applies the daily cap exactly as applyDailyCap does", () => {
    // 30 hard sets over three lifts (10 each, so none is beyond the 10-set limit): a day
    // well above the daily limit.
    const day: PlannedExercise[] = [
      sets(10, 10, 100),
      sets(10, 10, 100, "barbell-bench-press"),
      sets(10, 10, 100, "deadlift"),
    ];
    const bigDay = simulate({ ...twiceAWeek, trainingDays: [0], sessions: [day] }, 1);
    const perSet = day.flatMap((d) =>
      Array.from({ length: d.sets }, () => xp(d.reps, d.kg, 75, SIM_EXERCISES[d.slug])),
    );
    const capped = applyDailyCap(0, perSet);

    expect(capped.heldBack).toBeGreaterThan(0);
    expect(bigDay).toMatchObject({
      setXp: capped.awarded.reduce((a, b) => a + b, 0),
      heldBackXp: capped.heldBack,
      cappedDays: 1,
    });
  });

  it("never flags, jump-caps or limits a set of the honest player types, and every session is a training day", () => {
    for (const player of SIM_PLAYERS.filter((p) => !p.cheat)) {
      const r = simulate(player, player.weeks);
      expect({
        player: player.name,
        flagged: r.flaggedSets,
        capped: r.jumpCappedSets,
        beyond: r.beyondLimitSets,
        notTrainingDays: r.notTrainingDays,
      }).toEqual({
        player: player.name,
        flagged: 0,
        capped: 0,
        beyond: 0,
        notTrainingDays: 0,
      });
    }
  });

  it("keeps every honest player under the daily cap, also when they log warm-ups", () => {
    // The warm-up table in run.ts. With warm-ups the biggest honest day is 3,086 (14 under
    // the cap); this test fails if a rule change pushes it over.
    for (const player of SIM_PLAYERS.filter((p) => !p.cheat)) {
      for (const logsWarmUps of [undefined, true] as const) {
        const r = simulate({ ...player, logsWarmUps }, player.weeks);
        expect({ player: player.name, logsWarmUps, cappedDays: r.cappedDays }).toEqual({
          player: player.name,
          logsWarmUps,
          cappedDays: 0,
        });
      }
    }
  });

  it("logs the warm-up ramp before barbell lifts only, as warm-ups once the exercise has history", () => {
    // Two squat sessions: the second has a 12-week best, so its ramp (40/60/80% of 100 kg) is warm-ups.
    const plain = simulate({ ...twiceAWeek, sessions: [squat(100)] }, 1);
    const warm = simulate({ ...twiceAWeek, sessions: [squat(100)], logsWarmUps: true }, 1);
    const ramp = xp(5, 40) + xp(3, 60) + xp(2, 80);
    expect(warm.setXp).toBeGreaterThan(plain.setXp);
    expect(warm.setXp - plain.setXp).toBeLessThan(ramp); // warm-ups earn far less than at full effort
    expect(
      simulate({ ...twiceAWeek, sessions: [[sets(3, 10, 20, "dumbbell-curl")]], logsWarmUps: true }, 1).setXp,
    ).toBe(simulate({ ...twiceAWeek, sessions: [[sets(3, 10, 20, "dumbbell-curl")]] }, 1).setXp);
  });

  it("doesn't count a session of only warm-ups as a training day", () => {
    // Session 1 (3 x 8 x 100 kg) sets the 12-week best; session 2 is 3 x 8 x 20 kg: easy sets.
    const result = simulate({ ...twiceAWeek, sessions: [[sets(3, 8, 100)], [sets(3, 8, 20)]] }, 1);
    expect(result.notTrainingDays).toBe(1);
    expect(result.bonusXp).toBe(0); // 1 training day of the 2 needed
  });

  it("is deterministic", () => {
    expect(simulate(twiceAWeek, 10)).toEqual(simulate(twiceAWeek, 10));
  });
});

describe("body-part development (Milestone 6, the tables in docs/ARCHITECTURE.md)", () => {
  const byName = (prefix: string) => developmentPlayers().find((p) => p.name.startsWith(prefix))!;
  const rows = (prefix: string) => Object.fromEntries(developmentRows(byName(prefix)).map((r) => [r.part, r]));

  it("reproduces the plan's weeks to 0.25 / 0.5 / 0.9 for the intermediate and the beginner", () => {
    const intermediate = rows("Intermediate");
    expect(Object.values(intermediate.legs!.weeksTo)).toEqual([8, 19, 62]);
    expect(Object.values(intermediate.chest!.weeksTo)).toEqual([11, 26, 85]);
    expect(intermediate.legs!.afterOneYear).toBeCloseTo(0.86, 2);
    const beginner = rows("Beginner");
    expect(Object.values(beginner.chest!.weeksTo)).toEqual([14, 33, 108]);
    expect(Object.values(beginner.arms!.weeksTo)).toEqual([19, 44, 146]);
  });

  it("relative, not absolute: the light 60 kg lifter grows exactly like the intermediate (same hard sets)", () => {
    expect(developmentRows(byName("Light"))).toEqual(developmentRows(byName("Intermediate")));
  });

  it("untrained parts stay at the start: the intermediate's core and the leg-skipper's legs", () => {
    expect(rows("Intermediate").core!.afterTwoYears).toBe(0);
    expect(rows("Skips legs").legs!.afterTwoYears).toBe(0);
  });

  it("logging warm-ups changes nothing", () => {
    for (const prefix of ["Beginner", "Intermediate", "Advanced (90"]) {
      const player = byName(prefix);
      expect(developmentRows({ ...player, logsWarmUps: true }, 120)).toEqual(developmentRows(player, 120));
    }
  });

  it("shrinks as planned: a few weeks off cost a little, a year off goes back to the start", () => {
    expect(decayRow(2).change).toBeCloseTo(-0.006, 3);
    expect(decayRow(4).change).toBeCloseTo(-0.046, 3);
    expect(decayRow(12).change).toBeCloseTo(-0.205, 3);
    expect(decayRow(26).change).toBeCloseTo(-0.484, 3);
    expect(decayRow(52).after).toBe(0);
    const back = returningLegs();
    expect(back.after17Weeks).toBeCloseTo(0.471, 3);
  });
});
