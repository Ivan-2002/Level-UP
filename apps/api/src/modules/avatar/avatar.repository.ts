import type { AvatarStage } from "@levelup/shared";
import { prisma } from "../../lib/prisma.js";

// The only file that queries the avatar_stage table.

/** Every stage, lowest first. Five rows: read on every request, no cache (so a tuned row counts at once). */
export async function findStages(): Promise<AvatarStage[]> {
  return await prisma.avatarStage.findMany({ orderBy: { levelRequired: "asc" } });
}
