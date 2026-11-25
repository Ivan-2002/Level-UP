import { stageForLevel, type AvatarStage, type Profile } from "@levelup/shared";
import type { AvatarLook } from "@/components/Avatar";
import type { createCelebrationStore } from "@/stores/celebration-store";

// When to show the level-up screen, and remembering that it was shown.
// Plain TypeScript (no React), so the rules are unit-tested.

export type LevelUp = {
  /** The last level celebrated: "Level 4 → 6" when more than one level was gained. */
  from: number;
  to: number;
  /** The stage reached by this level-up, or null when it stays in the same stage. */
  newStage: AvatarStage | null;
};

/**
 * The level-up to show, or null. Shown when the level is above BOTH the server's
 * celebratedLevel (any phone) and what this phone showed but hasn't confirmed yet.
 * A profile without celebratedLevel (a copy saved before the field existed) shows nothing:
 * better to miss one celebration than to replay old ones.
 */
export function pendingLevelUp(profile: Profile, shownHere: number | undefined): LevelUp | null {
  if (profile.celebratedLevel === null) return null;
  const seen = Math.max(profile.celebratedLevel, shownHere ?? 0);
  const level = profile.level.level;
  if (level <= seen) return null;
  // Only the current stage is known, and that's enough: it's new if it starts after the
  // last level celebrated.
  const stage = profile.stage;
  return { from: seen, to: level, newStage: stage && stage.levelRequired > seen ? stage : null };
}

type Store = ReturnType<typeof createCelebrationStore>;

/**
 * Records a shown level-up and tells the server, retrying later if that fails.
 * - markShown: remember it on the phone first (so it's never shown twice), then send.
 * - flush: send what this phone showed and the server doesn't have yet. Called again
 *   whenever the profile reloads (reconnecting, a synced workout), until it succeeds.
 * One request at a time per player; the server keeps the highest level, so a repeat is harmless.
 */
export function createCelebrationSync(deps: {
  store: Store;
  send: (level: number) => Promise<Profile>;
  onSaved: (userId: string, profile: Profile) => void;
}) {
  const inFlight = new Set<string>();

  async function flush(userId: string): Promise<void> {
    const level = deps.store.getState().upTo[userId];
    if (level === undefined || inFlight.has(userId)) return;
    inFlight.add(userId);
    try {
      const profile = await deps.send(level);
      deps.store.getState().confirm(userId, level);
      deps.onSaved(userId, profile);
    } catch {
      // Offline or a server error: the level stays on the phone until the next flush.
    } finally {
      inFlight.delete(userId);
    }
  }

  return {
    flush,
    markShown: async (userId: string, level: number) => {
      deps.store.getState().markShown(userId, level);
      await flush(userId);
    },
  };
}

export type LevelUpText = {
  /** "Level 6", or "Level 4 → 6" when more than one level was gained. */
  levelText: string;
  /** "New stage: Regular", or null. */
  stageText: string | null;
  /** What screen readers hear when the screen opens: "Level up! Level 6. New stage: Regular." */
  announcement: string;
};

export function levelUpText(levelUp: LevelUp): LevelUpText {
  const single = levelUp.to === levelUp.from + 1;
  const stageText = levelUp.newStage ? `New stage: ${levelUp.newStage.name}` : null;
  return {
    levelText: single ? `Level ${levelUp.to}` : `Level ${levelUp.from} → ${levelUp.to}`,
    stageText,
    // "to", not an arrow: screen readers read "→" as "right arrow".
    announcement: `Level up! ${single ? `Level ${levelUp.to}` : `Level ${levelUp.from} to ${levelUp.to}`}.${stageText ? ` ${stageText}.` : ""}`,
  };
}

export type LevelUpMotion = {
  level: "zoom" | "none";
  avatar: "grow" | "none";
  /** A new stage: the old look first, then a crossfade to the new extras. */
  stage: "reveal" | "none";
};

/**
 * How the level-up screen moves. With "reduce motion" on, nothing scales, grows, slides or
 * fades: everything is drawn in its final state at once (the new extras, proud).
 */
export function levelUpMotion(reduceMotion: boolean): LevelUpMotion {
  return reduceMotion
    ? { level: "none", avatar: "none", stage: "none" }
    : { level: "zoom", avatar: "grow", stage: "reveal" };
}

/** When the old look crossfades to the new one: after the avatar has risen into place. */
export const STAGE_REVEAL_DELAY_MS = 1100;
export const STAGE_REVEAL_FADE_MS = 450;

export type LevelUpLooks = {
  /** The look before this level-up (the old stage's extras, neutral); null when there's nothing new to reveal. */
  from: AvatarLook | null;
  /** The final look: the stage's extras, proud. */
  to: AvatarLook;
};

/**
 * What the level-up screen draws (docs/ARCHITECTURE.md: "when the stage changes, it
 * animates from the old look to the new one"). The body (development) is the player's in
 * both: a level never changes the shape, only the extras.
 * - `to`: the new stage's extras (the profile's stage: the one the headline names), proud.
 * - `from`: only when the stage changed AND its extras differ: the extras of the stage at
 *   the last level celebrated, from GET /v1/avatar's `stages`. Without `stages` (never
 *   loaded on this phone) it's null and the screen draws the final look straight away.
 */
export function levelUpLooks(
  levelUp: LevelUp,
  player: AvatarLook,
  stages: readonly AvatarStage[] | undefined,
): LevelUpLooks {
  const to: AvatarLook = { ...player, extras: levelUp.newStage?.extras ?? player.extras, expression: "proud" };
  if (!levelUp.newStage || !stages) return { from: null, to };
  const oldExtras = stageForLevel(stages, levelUp.from)?.extras ?? [];
  const same = oldExtras.length === to.extras.length && oldExtras.every((e, i) => e === to.extras[i]);
  return { from: same ? null : { ...player, extras: oldExtras, expression: "neutral" }, to };
}
