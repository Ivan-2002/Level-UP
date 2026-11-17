import { z } from "zod";

// ---------------------------------------------------------------------------
// Levels and XP (see docs/ARCHITECTURE.md, "XP & level system")
// ---------------------------------------------------------------------------

/**
 * Total XP needed to REACH a level: 400 × (level − 1)^2.15. Level 1 needs 0 XP.
 * Level 2 at 400 (a beginner's first session), 5 at ~7,900, 10 at ~45,000, 20 at ~225,000:
 * about a year to level 20 for a regular player (Milestone 5 simulation). No maximum level.
 */
export const LEVEL_CURVE = { base: 400, exponent: 2.15 } as const;

export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`Level must be a whole number of at least 1, got ${level}`);
  }
  return Math.round(LEVEL_CURVE.base * Math.pow(level - 1, LEVEL_CURVE.exponent));
}

/** The level a player is at with this much total XP. */
export function levelFromXp(totalXp: number): number {
  if (totalXp < 0) throw new RangeError("Total XP cannot be negative");
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}

export type LevelProgress = {
  level: number;
  /** Total XP at which the current level started. */
  levelStartXp: number;
  /** Total XP needed for the next level. */
  nextLevelXp: number;
  /** 0 to 1: how far through the current level. */
  progress: number;
};

/** Everything the XP bar needs: level, boundaries and progress through the level. */
export function levelProgress(totalXp: number): LevelProgress {
  const level = levelFromXp(totalXp);
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  return {
    level,
    levelStartXp,
    nextLevelXp,
    progress: (totalXp - levelStartXp) / (nextLevelXp - levelStartXp),
  };
}

/**
 * What the API sends for an XP bar (GET /v1/profile, the Finish summary): the server owns
 * the curve, so the app draws the bar without knowing it, and the curve can be rebalanced
 * without an app update. The bar is xpIntoLevel / xpForNextLevel.
 */
export const levelStatusSchema = z.object({
  level: z.number().int().min(1),
  /** XP earned since the current level started. */
  xpIntoLevel: z.number().int().min(0),
  /** XP the current level spans, from its start to the next level. */
  xpForNextLevel: z.number().int().positive(),
});
export type LevelStatus = z.infer<typeof levelStatusSchema>;

/** The level status for a total XP (server side). */
export function levelStatus(totalXp: number): LevelStatus {
  const { level, levelStartXp, nextLevelXp } = levelProgress(totalXp);
  return { level, xpIntoLevel: totalXp - levelStartXp, xpForNextLevel: nextLevelXp - levelStartXp };
}
