import { progressSeries } from "../src/development.js";
import { BODY_PARTS, type BodyPart } from "../src/workouts.js";
import { SIM_PLAYERS, type SimPlayer } from "./players.js";
import { SIM_FIRST_DAY, simulate, type SimResult } from "./simulate.js";

// Body-part development for the simulated players, through the REAL rule
// (packages/shared/src/development.ts) and the stimulus the real scoring gives each set.
// `pnpm --filter @levelup/shared sim` prints these tables; the decision log quotes them.

/** Weeks simulated for the development tables: long enough to reach 0.9 for every trained part. */
export const DEVELOPMENT_WEEKS = 260;
export const DEVELOPMENT_MARKS = [0.25, 0.5, 0.9] as const;

const dayAfter = (n: number) =>
  new Date(Date.parse(`${SIM_FIRST_DAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A part's development at the end (Sunday) of each simulated week. */
export function weeklyDevelopment(result: SimResult, part: BodyPart, weeks: number): number[] {
  const days = result.stimulus.filter((s) => s.bodyPart === part);
  const series = progressSeries(days, SIM_FIRST_DAY, dayAfter(7 * weeks - 1));
  return Array.from({ length: weeks }, (_, w) => series[7 * w + 6]!.progress);
}

export type PartRow = {
  part: BodyPart;
  /** Average weekly dose (summed stimulus) over weeks 5 to 30. */
  dose: number;
  /** The week (1-based) whose Sunday first reaches each mark, or null (never, or untrained). */
  weeksTo: Record<(typeof DEVELOPMENT_MARKS)[number], number | null>;
  afterOneYear: number;
  afterTwoYears: number;
};

export function developmentRows(player: SimPlayer, weeks = DEVELOPMENT_WEEKS): PartRow[] {
  const result = simulate(player, weeks);
  return BODY_PARTS.map((part) => {
    const series = weeklyDevelopment(result, part, weeks);
    const dosePerWeek =
      result.stimulus
        .filter((s) => s.bodyPart === part && s.day >= dayAfter(28) && s.day < dayAfter(7 * 30))
        .reduce((sum, s) => sum + s.stimulus, 0) / 26;
    const first = (mark: number) => {
      const i = series.findIndex((v) => v >= mark);
      return i < 0 ? null : i + 1;
    };
    return {
      part,
      dose: dosePerWeek,
      weeksTo: { 0.25: first(0.25), 0.5: first(0.5), 0.9: first(0.9) },
      afterOneYear: series[51]!,
      afterTwoYears: series[103]!,
    };
  });
}

/** The players the development table covers: the honest ones, plus one who skips legs. */
export function developmentPlayers(): SimPlayer[] {
  const honest = SIM_PLAYERS.filter((p) => !p.cheat);
  const intermediate = SIM_PLAYERS.find((p) => p.name.startsWith("Intermediate"))!;
  return [
    ...honest.filter((p) => !p.strengthAt), // the returning player is in the decay table
    { ...intermediate, name: "Skips legs (intermediate, push/pull only)", sessions: intermediate.sessions.slice(0, 2) },
  ];
}

/** The intermediate's legs after a year of training and `weeksOff` weeks off: before, after, and the change. */
export function decayRow(weeksOff: number): { weeksOff: number; before: number; after: number; change: number } {
  const intermediate = SIM_PLAYERS.find((p) => p.name.startsWith("Intermediate"))!;
  const player: SimPlayer = {
    ...intermediate,
    strengthAt: (w) =>
      w >= 52 && w < 52 + weeksOff ? null : Math.min(intermediate.growth.max, 1 + intermediate.growth.perWeek * w),
  };
  const series = weeklyDevelopment(simulate(player, 52 + weeksOff + 1), "legs", 52 + weeksOff + 1);
  const before = series[51]!;
  const after = series[51 + weeksOff]!;
  return { weeksOff, before, after, change: after / before - 1 };
}

export const DECAY_WEEKS_OFF = [2, 3, 4, 8, 12, 26, 52] as const;

/** The returning player's legs: weeks back after a year off to reach 0.47, and the value a year after returning. */
export function returningLegs(): { atReturn: number; after17Weeks: number; afterOneYearBack: number } {
  const returning = SIM_PLAYERS.find((p) => p.name.startsWith("Returning"))!;
  const series = weeklyDevelopment(simulate(returning, 156), "legs", 156);
  return { atReturn: series[103]!, after17Weeks: series[103 + 17]!, afterOneYearBack: series[155]! };
}
