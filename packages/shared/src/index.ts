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
export * from "./progression.js";
export * from "./routines.js";
export * from "./units.js";
export * from "./weekly-goal.js";
export * from "./xp-codes.js";
export * from "./xp-limits.js";
export * from "./set-scoring.js";
export * from "./levels.js";
export * from "./avatar.js";

/** Response of GET /health. */
export type HealthResponse = {
  status: "ok" | "degraded";
  database: "up" | "down";
  uptimeSeconds: number;
  timestamp: string;
};
