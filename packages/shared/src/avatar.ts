import { z } from "zod";

// ---------------------------------------------------------------------------
// Avatar stages (see docs/ARCHITECTURE.md, "Avatar prototype")
//
// The stages are DATA (the avatar_stage table), not code: the server reads them and
// sends the player's stage with the profile and the Finish summary. This file only has
// the contract and the one rule, so the API and its tests agree on it.
// ---------------------------------------------------------------------------

export const avatarStageSchema = z.object({
  /** Stable id ("regular"); the app draws the stage's extras from it (Milestone 6). */
  key: z.string(),
  /** Shown to the player: "Regular". */
  name: z.string(),
  levelRequired: z.number().int().min(1),
});
export type AvatarStage = z.infer<typeof avatarStageSchema>;

/**
 * The stage a player at `level` has: the one with the highest levelRequired at or below
 * the level. Null only if no stage starts at or below it (no rows, or none at level 1).
 */
export function stageForLevel(stages: readonly AvatarStage[], level: number): AvatarStage | null {
  let best: AvatarStage | null = null;
  for (const stage of stages) {
    if (stage.levelRequired <= level && (best === null || stage.levelRequired > best.levelRequired)) best = stage;
  }
  return best;
}
