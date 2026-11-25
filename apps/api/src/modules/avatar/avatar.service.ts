import { stageForLevel, type AvatarStage } from "@levelup/shared";
import * as repo from "./avatar.repository.js";

// The avatar's stages: data in the avatar_stage table, never code (CLAUDE.md rule 6).
// A player's stage is derived from their level on every read, never stored, so tuning a
// threshold applies to everyone at once. Other modules (users, workouts, progression) ask
// here; they never read the table themselves. Body-part development is a ledger rule, so it
// lives in the progression module (which owns xp_event) and asks here for the stages.

/** Every stage, lowest first (GET /v1/avatar sends them so the app can draw an earlier stage). */
export async function allStages(): Promise<AvatarStage[]> {
  return repo.findStages();
}

/** The stage of one level (the profile). */
export async function stageAt(level: number): Promise<AvatarStage | null> {
  return stageForLevel(await repo.findStages(), level);
}

/** The stages of two levels with one query (the Finish summary: before and after). */
export async function stagesAt(
  before: number,
  after: number,
): Promise<{ before: AvatarStage | null; after: AvatarStage | null }> {
  const stages = await repo.findStages();
  return { before: stageForLevel(stages, before), after: stageForLevel(stages, after) };
}
