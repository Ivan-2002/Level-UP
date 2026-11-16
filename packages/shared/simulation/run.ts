import { xpForLevel } from "../src/index.js";
import { WEEKLY_GOAL } from "../src/weekly-goal.js";
import { SIM_PLAYERS } from "./players.js";
import { SIM_LEVELS, simulate, type LevelReached } from "./simulate.js";

// `pnpm --filter @levelup/shared sim`: prints the balance table as Markdown, ready to
// paste into the decision log. Rerun it whenever an XP constant or rule changes.

const WEEKS = 104;

const when = (r: LevelReached | null) => {
  if (r === null) return `> ${WEEKS / 52} yr`;
  if (r.session === 0) return "1st session";
  if (r.day < 7) return `${r.day + 1} d`;
  return `${Math.round(r.day / 7)} wk`;
};

const rows = SIM_PLAYERS.map((p) => simulate(p, WEEKS)).map((r) =>
  [
    r.player,
    r.firstWeekSessionXp.map((xp) => xp.toLocaleString("en-US")).join(" / "),
    r.biggestDayXp.toLocaleString("en-US"),
    ...SIM_LEVELS.map((l) => when(r.reached[l])),
    `${r.longestStreak} wk`,
    `${Math.round((100 * r.bonusXp) / r.totalXp)}%`,
    `${r.flaggedSets} / ${r.jumpCappedSets}`,
  ].join(" | "),
);

const header = ["Player", "Session XP, week 1", "Biggest day", ...SIM_LEVELS.map((l) => `Level ${l}`), "Longest streak", "From bonuses", "Flagged / jump-capped sets"];

console.log(`Balance simulation, ${WEEKS} weeks\n`);
console.log(`| ${header.join(" | ")} |`);
console.log(`|${header.map(() => " --- ").join("|")}|`);
for (const row of rows) console.log(`| ${row} |`);
console.log(
  `\nLevels: ${SIM_LEVELS.map((l) => `${l} = ${xpForLevel(l).toLocaleString("en-US")}`).join(", ")} XP. ` +
    `Weekly goal +${WEEKLY_GOAL.weeklyBonusXp}; streaks ${WEEKLY_GOAL.streakMilestones.map((m) => `${m.weeks} wk +${m.xp}`).join(", ")}. ` +
    "Daily cap: none yet.",
);
