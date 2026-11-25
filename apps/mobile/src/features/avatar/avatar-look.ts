import type { AvatarResponse, Profile } from "@levelup/shared";
import type { AvatarLook } from "@/components/Avatar";
import { DEFAULT_FACE, type Expression } from "@/components/avatar-face";
import { ZERO_DEVELOPMENT } from "@/components/avatar-shape";

// The player's avatar look (the Avatar component's contract) from what the server sent.
// Plain TypeScript, unit-tested.

/**
 * - development and stamina: GET /v1/avatar; a new phone offline with nothing saved
 *   draws lines only until it loads.
 * - extras: the PROFILE's stage, so the drawn extras always match the stage name in the
 *   level bar next to it (both come from the same answer); the avatar's stage if there's
 *   no profile yet.
 * - face: the default until the face picker (6e) puts the player's choice on the profile.
 */
export function playerLook(
  avatar: AvatarResponse | null | undefined,
  profile: Pick<Profile, "stage"> | null | undefined,
  expression: Expression = "neutral",
): AvatarLook {
  return {
    development: avatar?.development ?? ZERO_DEVELOPMENT,
    extras: profile?.stage?.extras ?? avatar?.stage?.extras ?? [],
    face: DEFAULT_FACE,
    stamina: avatar?.stamina ?? 0,
    expression,
  };
}
