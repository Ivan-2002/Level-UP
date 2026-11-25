import { xpForLevel } from "../src/index.js";
import { WEEKLY_GOAL } from "../src/weekly-goal.js";
import { DAILY_XP_CAP } from "../src/xp-limits.js";
import { SIM_PLAYERS, WARM_UP_RAMP, type SimPlayer } from "./players.js";
import { SIM_LEVELS, simulate, type LevelReached } from "./simulate.js";
import {
  DECAY_WEEKS_OFF,
  DEVELOPMENT_MARKS,
  DEVELOPMENT_WEEKS,
  decayRow,
  developmentPlayers,
  developmentRows,
  returningLegs,
} from "./development.js";

// `pnpm --filter @levelup/shared sim`: prints the balance table as Markdown, ready to
// paste into the decision log. Rerun it whenever an XP constant or rule changes.

const WEEKS = 104;

const when = (r: LevelReached | null, weeks: number) => {
  if (r === null) return `> ${weeks / 52} yr`;
  if (r.session === 0) return "1st session";
  if (r.day < 7) return `${r.day + 1} d`;
  return `${Math.round(r.day / 7)} wk`;
};

const row = (p: SimPlayer) => {
  const weeks = p.weeks ?? WEEKS;
  const r = simulate(p, weeks);
  return [
    r.player,
    r.firstWeekSessionXp.map((xp) => xp.toLocaleString("en-US")).join(" / "),
    `${r.biggestDayXp.toLocaleString("en-US")} (${Math.round((100 * r.biggestDayXp) / DAILY_XP_CAP.limit)}%)`,
    ...SIM_LEVELS.map((l) => when(r.reached[l], weeks)),
    `${r.longestStreak} wk`,
    `${Math.round((100 * r.bonusXp) / r.totalXp)}%`,
    `${r.flaggedSets} / ${r.jumpCappedSets} / ${r.beyondLimitSets}`,
    r.cappedDays === 0 ? "0" : `${r.cappedDays} (${r.heldBackXp.toLocaleString("en-US")} held back)`,
  ].join(" | ");
};

const header = [
  "Player",
  "Session XP, week 1",
  "Biggest day (% of cap)",
  ...SIM_LEVELS.map((l) => `Level ${l}`),
  "Longest streak",
  "From bonuses",
  "Flagged / jump-capped / beyond 10",
  "Capped days",
];

function table(players: SimPlayer[]) {
  console.log(`| ${header.join(" | ")} |`);
  console.log(`|${header.map(() => " --- ").join("|")}|`);
  for (const p of players) console.log(`| ${row(p)} |`);
}

console.log(`Balance simulation, ${WEEKS} weeks (the returning player: ${WEEKS + 52})\n`);
table(SIM_PLAYERS);

// The same honest players, each also logging a warm-up ramp before every barbell lift.
const ramp = WARM_UP_RAMP.map((s) => `${s.share * 100}% x ${s.reps}`).join(", ");
console.log(`\nThe honest players, also logging warm-ups before each barbell lift (${ramp})\n`);
table(SIM_PLAYERS.filter((p) => !p.cheat).map((p) => ({ ...p, logsWarmUps: true })));
const levels = SIM_LEVELS.map((l) => [l, xpForLevel(l).toLocaleString("en-US")].join(" = ")).join(", ");
const streaks = WEEKLY_GOAL.streakMilestones.map((m) => `${m.weeks} wk +` + m.xp).join(", ");
const ceiling = (DAILY_XP_CAP.limit * DAILY_XP_CAP.ceilingMultiple).toLocaleString("en-US");
console.log(
  `\nLevels: ${levels} XP. ` +
    `Weekly goal +${WEEKLY_GOAL.weeklyBonusXp}; streaks ${streaks}. ` +
    `Daily cap ${DAILY_XP_CAP.limit.toLocaleString("en-US")}, ${DAILY_XP_CAP.bandRate * 100}% beyond, ceiling ${ceiling}.`,
);

// --- Body-part development (Milestone 6) --------------------------------------------

const fixed = (v: number) => v.toFixed(2);
const wk = (w: number | null) => (w === null ? "–" : `${w}`);

console.log(
  `\nBody-part development (${DEVELOPMENT_WEEKS} weeks): hard sets a week (avg weeks 5-30), weeks to ` +
    `${DEVELOPMENT_MARKS.join(" / ")}, and development after 1 and 2 years. Untrained parts stay at 0.\n`,
);
console.log("| Player | Part | Hard sets / wk | 0.25 | 0.5 | 0.9 | 1 yr | 2 yr |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const player of developmentPlayers()) {
  for (const row of developmentRows(player)) {
    if (row.dose === 0) {
      console.log(`| ${player.name} | ${row.part} | 0 | stays at the start | | | 0 | 0 |`);
      continue;
    }
    const w = row.weeksTo;
    console.log(
      `| ${player.name} | ${row.part} | ${row.dose.toFixed(1)} | ${wk(w[0.25])} | ${wk(w[0.5])} | ${wk(w[0.9])} | ` +
        `${fixed(row.afterOneYear)} | ${fixed(row.afterTwoYears)} |`,
    );
  }
}

console.log("\nShrinking: the intermediate's legs after a year of training, then weeks off\n");
console.log("| Weeks off | Legs before | Legs after | Change |");
console.log("| --- | --- | --- | --- |");
for (const off of DECAY_WEEKS_OFF) {
  const r = decayRow(off);
  console.log(`| ${off} | ${r.before.toFixed(3)} | ${r.after.toFixed(3)} | ${(100 * r.change).toFixed(1)}% |`);
}
const back = returningLegs();
console.log(
  `\nReturning player (a year on, a year off): legs ${back.atReturn.toFixed(3)} on return, ` +
    `${back.after17Weeks.toFixed(3)} after 17 weeks back, ${back.afterOneYearBack.toFixed(3)} after a year back.`,
);
