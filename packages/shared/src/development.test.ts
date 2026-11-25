import { describe, expect, it } from "vitest";
import { avatarResponseSchema, developmentSchema } from "./avatar.js";
import {
  declineFactor,
  DEVELOPMENT,
  developmentByPart,
  partDevelopment,
  progressSeries,
  setStimulus,
  weeklyResponse,
  type StimulusDay,
} from "./development.js";
import { BODY_PARTS } from "./workouts.js";

const MONDAY = "2026-01-05";
/** The local day `n` days after `from`. */
const plus = (from: string, n: number) =>
  new Date(Date.parse(`${from}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Hard sets (stimulus `sets`) on the given weekdays of `weeks` weeks from `from`. */
function training(weeks: number, weekdays: number[], sets: number, from = MONDAY): StimulusDay[] {
  return Array.from({ length: weeks }, (_, w) =>
    weekdays.map((d) => ({ day: plus(from, 7 * w + d), stimulus: sets })),
  ).flat();
}

/** The week index (1-based) at whose Sunday development first reaches `value`, or null. */
function weeksTo(days: StimulusDay[], value: number, maxWeeks = 400): number | null {
  const series = progressSeries(days, MONDAY, plus(MONDAY, 7 * maxWeeks - 1));
  for (let w = 0; w < maxWeeks; w++) if (series[7 * w + 6]!.progress >= value) return w + 1;
  return null;
}

describe("setStimulus", () => {
  it("is the set's effort for a set that counts", () => {
    expect(setStimulus({ effort: 1, tag: null, isFlagged: false })).toBe(1);
    expect(setStimulus({ effort: 0.4, tag: "easy_set", isFlagged: false })).toBe(0.4);
    expect(setStimulus({ effort: 1, tag: "above_history", isFlagged: false })).toBe(1);
    expect(setStimulus({ effort: 1, tag: "timed_limit", isFlagged: false })).toBe(1);
  });

  it("is 0 for warm-ups, flagged sets and sets beyond the 10-set limit", () => {
    expect(setStimulus({ effort: 0.2, tag: "warm_up", isFlagged: false })).toBe(0);
    expect(setStimulus({ effort: 1, tag: "check_set", isFlagged: true })).toBe(0);
    expect(setStimulus({ effort: 1, tag: "beyond_set_limit", isFlagged: false })).toBe(0);
  });
});

describe("the curve", () => {
  it("has diminishing returns per week", () => {
    expect(weeklyResponse(0)).toBe(0);
    expect(weeklyResponse(6)).toBeCloseTo(0.53, 2);
    expect(weeklyResponse(10)).toBeCloseTo(0.71, 2);
    expect(weeklyResponse(20)).toBeCloseTo(0.92, 2);
    expect(weeklyResponse(40)).toBeLessThan(1);
  });

  it("is 0 with no stimulus, and stays at the start", () => {
    expect(partDevelopment([], "2026-06-01")).toEqual({ development: 0, lastTrainedOn: null });
    expect(partDevelopment([], "2026-06-01", 0.3).development).toBe(0.3);
  });

  it("counts the current week as it fills up (a workout shows at once)", () => {
    const monday = partDevelopment([{ day: MONDAY, stimulus: 20 }], MONDAY).development;
    expect(monday).toBeCloseTo(DEVELOPMENT.rate * weeklyResponse(20), 10);
    expect(partDevelopment([{ day: MONDAY, stimulus: 20 }], plus(MONDAY, 6)).development).toBe(monday);
  });

  it("saturates over time: never reaches 1, and the fastest possible growth reaches 0.5 in 17 weeks", () => {
    const unlimited = training(400, [0], 10_000);
    expect(weeksTo(unlimited, 0.5)).toBe(17);
    expect(partDevelopment(unlimited, plus(MONDAY, 7 * 400)).development).toBeLessThan(1);
  });

  it("applies the starting shape: start + (1 − start) × progress", () => {
    const days = training(10, [0, 2, 4], 6);
    const today = plus(MONDAY, 69);
    const progress = partDevelopment(days, today).development;
    expect(partDevelopment(days, today, 0.4).development).toBeCloseTo(0.4 + 0.6 * progress, 12);
  });

  it("ignores stimulus after the evaluation day", () => {
    const days = [...training(4, [0], 10), { day: plus(MONDAY, 100), stimulus: 50 }];
    expect(partDevelopment(days, plus(MONDAY, 50))).toEqual(partDevelopment(training(4, [0], 10), plus(MONDAY, 50)));
  });
});

describe("shrinking", () => {
  const year = training(52, [0, 2, 4], 7); // a year of three sessions a week
  const lastSession = plus(MONDAY, 7 * 51 + 4); // week 52's Friday
  const at = (daysOff: number) => partDevelopment(year, plus(lastSession, daysOff)).development;
  const peak = at(0);

  it("does nothing for 14 days after the last trained day", () => {
    expect(at(DEVELOPMENT.graceDays)).toBe(peak);
    expect(at(DEVELOPMENT.graceDays + 1)).toBeLessThan(peak);
  });

  it("falls in a straight line back to the start a year after the last training", () => {
    const d1 = at(15);
    expect(peak - d1).toBeCloseTo(peak / 351, 10);
    expect(at(14 + 100)).toBeCloseTo(peak * (1 - 100 / 351), 10);
    expect(at(14 + 200)).toBeCloseTo(peak * (1 - 200 / 351), 10);
    expect(at(365)).toBe(0);
    expect(at(500)).toBe(0);
  });

  it("stops at once when training starts again", () => {
    const back = [...year, { day: plus(lastSession, 60), stimulus: 7 }];
    const before = partDevelopment(back, plus(lastSession, 59)).development;
    const on = partDevelopment(back, plus(lastSession, 60)).development;
    expect(on).toBeGreaterThan(before);
  });

  it("a day with less than one hard set's stimulus isn't a trained day", () => {
    const light = [...year, { day: plus(lastSession, 20), stimulus: 0.5 }];
    expect(partDevelopment(light, plus(lastSession, 21)).lastTrainedOn).toBe(lastSession);
    expect(declineFactor(0)).toBe(1);
    expect(declineFactor(351)).toBe(0);
  });
});

describe("property: adding a set never lowers any part's development on any day", () => {
  // Scope: ADDED sets only (stimulus > 0), the only kind Milestone 6 records. Milestone 7's
  // negative correction rows lower development on purpose and are outside this property.

  /** A small deterministic PRNG (mulberry32), so a failure reproduces from its seed. */
  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * A random history over ~100 days: bursts of training, breaks long enough to cross the
   * 14-day grace period, and small (below one hard set) stimuli inside breaks, which is
   * the case that broke the "remembered value" version of the decline.
   */
  function randomHistory(next: () => number): StimulusDay[] {
    const days: StimulusDay[] = [];
    for (let d = 0; d < 100; d++) {
      const r = next();
      if (r < 0.25) days.push({ day: plus(MONDAY, d), stimulus: 1 + Math.floor(next() * 15) });
      else if (r < 0.4) days.push({ day: plus(MONDAY, d), stimulus: Math.round(next() * 90) / 100 });
      if (next() < 0.04) d += 10 + Math.floor(next() * 30); // a break
    }
    return days;
  }

  it("holds for 300 random histories, each with a set added on a random day, checked on every day", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const next = rng(seed);
      const history = randomHistory(next);
      const added = { day: plus(MONDAY, Math.floor(next() * 120)), stimulus: 0.05 + next() * 2 };
      const end = plus(MONDAY, 200); // past the history: the declines play out
      const before = progressSeries(history, MONDAY, end);
      const after = progressSeries([...history, added], MONDAY, end);
      after.forEach((a, i) => {
        if (a.progress < before[i]!.progress - 1e-12) {
          throw new Error(
            `seed ${seed}: ${a.day} fell from ${before[i]!.progress} to ${a.progress} after adding ${JSON.stringify(added)}`,
          );
        }
      });
    }
  });

  /** Checks the property for one history and one added set, on every day up to `end`. */
  function holds(history: StimulusDay[], added: StimulusDay, end: string, label: string) {
    const before = progressSeries(history, MONDAY, end);
    const after = progressSeries([...history, added], MONDAY, end);
    after.forEach((a, i) => {
      if (a.progress < before[i]!.progress - 1e-12) {
        throw new Error(
          `${label}: ${a.day} fell from ${before[i]!.progress} to ${a.progress} after adding ${JSON.stringify(added)}`,
        );
      }
    });
  }

  it("holds after a year of training followed by a long break of light days (the case the remembered-value decline failed)", () => {
    // Under "minus (value when the decline began) ÷ 351 a day", the extra set raised the
    // peak, the decline then fell faster from it, and from day 611 this history was LOWER.
    const history = [...training(52, [0, 2, 4], 7)];
    for (let d = 7 * 52; d < 7 * 112; d++) history.push({ day: plus(MONDAY, d), stimulus: 0.9 });
    holds(history, { day: plus(MONDAY, 7 * 51 + 4), stimulus: 5 }, plus(MONDAY, 7 * 112), "targeted");
  });

  it("holds for 100 random long histories with runs of light days inside long breaks", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const next = rng(1_000 + seed);
      const history: StimulusDay[] = [];
      let d = 0;
      while (d < 500) {
        const train = 7 * (1 + Math.floor(next() * 30)); // 1 to 30 weeks of training
        for (const end = d + train; d < end; d++)
          if (next() < 0.45) history.push({ day: plus(MONDAY, d), stimulus: 2 + next() * 12 });
        const rest = 15 + Math.floor(next() * 300); // a break past the grace period
        const light = next() < 0.6; // most breaks have light (below one hard set) days
        for (const end = d + rest; d < end; d++)
          if (light && next() < 0.8) history.push({ day: plus(MONDAY, d), stimulus: next() * 0.99 });
      }
      const added = { day: plus(MONDAY, Math.floor(next() * 500)), stimulus: 0.05 + next() * 6 };
      holds(history, added, plus(MONDAY, 600), `seed ${1_000 + seed}`);
    }
  });

  it("holds per body part: a set for one part never changes another", () => {
    const rows = [
      { bodyPart: "legs" as const, day: MONDAY, stimulus: 10 },
      { bodyPart: "chest" as const, day: plus(MONDAY, 2), stimulus: 8 },
    ];
    const before = developmentByPart(rows, plus(MONDAY, 30));
    const after = developmentByPart(
      [...rows, { bodyPart: "arms", day: plus(MONDAY, 3), stimulus: 6 }],
      plus(MONDAY, 30),
    );
    for (const part of BODY_PARTS.filter((p) => p !== "arms"))
      expect(after.development[part]).toBe(before.development[part]);
    expect(after.development.arms).toBeGreaterThan(before.development.arms);
  });
});

describe("contracts", () => {
  it("the development schema's keys are exactly BODY_PARTS", () => {
    expect(Object.keys(developmentSchema.shape).sort()).toEqual([...BODY_PARTS].sort());
    expect(Object.keys(avatarResponseSchema.shape.lastTrainedOn.shape).sort()).toEqual([...BODY_PARTS].sort());
  });
});
