// @levelup/shared — code that the app AND the API both need.
//
// Rules for this package:
// - Only types and PURE functions (same input -> same output, no I/O).
// - No React, no Express, no Prisma: it must run anywhere.
// - The server is still the authority on XP. The app uses these functions
//   only to DISPLAY progress (e.g. drawing the XP bar), never to award XP.

// ---------------------------------------------------------------------------
// API contracts
// ---------------------------------------------------------------------------

export * from "./profile.js";
export * from "./workouts.js";

/** Response of GET /health. */
export type HealthResponse = {
  status: "ok" | "degraded";
  database: "up" | "down";
  uptimeSeconds: number;
  timestamp: string;
};

// ---------------------------------------------------------------------------
// Levels and XP (see docs/ARCHITECTURE.md, "XP & level system")
// ---------------------------------------------------------------------------

/** Total XP needed to REACH a level: 100 × (level − 1)^1.5. Level 1 needs 0 XP. */
export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`Level must be a whole number of at least 1, got ${level}`);
  }
  return Math.round(100 * Math.pow(level - 1, 1.5));
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
