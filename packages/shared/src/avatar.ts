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
  /**
   * The extras the stage draws, cumulative ("wristbands", "outfit", "headband", "cape"):
   * data, not code (avatar_stage.extras). The app draws the ones it knows and ignores the
   * rest. Defaults to none for stages cached before the field existed.
   */
  extras: z.array(z.string()).default([]),
});
export type AvatarStage = z.infer<typeof avatarStageSchema>;

/**
 * One development value (0 to 1) per body part. The keys are BODY_PARTS (workouts.ts),
 * written out because workouts.ts imports this file; a test keeps the two in step.
 */
const part = z.number().min(0).max(1);
export const developmentSchema = z.object({
  chest: part,
  back: part,
  shoulders: part,
  arms: part,
  core: part,
  legs: part,
});
export type DevelopmentValues = z.infer<typeof developmentSchema>;

/** GET /v1/avatar: everything the avatar is drawn from, except the face (on the profile). */
export const avatarResponseSchema = z.object({
  /** The player's stage (from their level), or null if no stage starts at or below it. */
  stage: avatarStageSchema.nullable(),
  /** Every stage, lowest first: the level-up screen draws the OLD stage's extras from it. */
  stages: z.array(avatarStageSchema),
  development: developmentSchema,
  /** The earned endurance stat; always 0 until the endurance milestone. */
  stamina: z.number().min(0).max(1),
  /** Per body part, the last local day it was trained ("YYYY-MM-DD"), or null. */
  lastTrainedOn: z.object({
    chest: z.string().nullable(),
    back: z.string().nullable(),
    shoulders: z.string().nullable(),
    arms: z.string().nullable(),
    core: z.string().nullable(),
    legs: z.string().nullable(),
  }),
});
export type AvatarResponse = z.infer<typeof avatarResponseSchema>;

/**
 * The stage a player at `level` has: the one with the highest levelRequired at or below
 * the level. Null only if no stage starts at or below it (no rows, or none at level 1).
 */
export function stageForLevel<S extends Pick<AvatarStage, "levelRequired">>(
  stages: readonly S[],
  level: number,
): S | null {
  let best: S | null = null;
  for (const stage of stages) {
    if (stage.levelRequired <= level && (best === null || stage.levelRequired > best.levelRequired)) best = stage;
  }
  return best;
}
