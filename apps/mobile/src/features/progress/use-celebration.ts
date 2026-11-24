import { useCallback, useEffect } from "react";
import { router, useFocusEffect } from "expo-router";
import type { Profile } from "@levelup/shared";
import { apiPost } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { celebrationStore, useCelebration } from "@/stores/device-stores";
import { saveProfile } from "@/features/profile/use-profile";
import { createCelebrationSync, pendingLevelUp, type LevelUp } from "./level-up";

// Connects the level-up rules (level-up.ts, unit-tested) to the API and the stores.

export const celebrationSync = createCelebrationSync({
  store: celebrationStore,
  send: (level) => apiPost<Profile>("/profile/celebrated", { level }),
  onSaved: (userId, profile) => saveProfile(queryClient, userId, profile),
});

/**
 * Sends a level-up this phone showed but the server doesn't have yet, whenever the profile
 * reloads (app start, reconnecting, a workout synced). Mounted once, in the signed-in layout.
 */
export function useCelebrationSync(userId: string | undefined, profile: Profile | null | undefined): void {
  const waiting = useCelebration((s) => (userId ? s.upTo[userId] : undefined));
  useEffect(() => {
    if (userId && profile && waiting !== undefined) void celebrationSync.flush(userId);
  }, [userId, profile, waiting]);
}

// One level-up screen at a time, even if two screens ask in the same moment.
let levelUpOpen = false;
/** Called by the level-up screen when it closes. */
export function levelUpClosed(): void {
  levelUpOpen = false;
}

/**
 * Opens the level-up screen when there's a level-up to show and this screen is in front.
 * Used only on Home and the workout summary, so a workout that syncs in the background
 * never interrupts the active workout: the level-up waits for the next visit to either.
 */
export function useLevelUpPrompt(userId: string | undefined, profile: Profile | null | undefined): void {
  const to = usePendingLevelUp(userId, profile)?.to;
  useFocusEffect(
    useCallback(() => {
      if (to === undefined || levelUpOpen) return;
      levelUpOpen = true;
      router.push("/level-up");
    }, [to]),
  );
}

/** The level-up to show now for this player, or null. */
export function usePendingLevelUp(userId: string | undefined, profile: Profile | null | undefined): LevelUp | null {
  const shownHere = useCelebration((s) => (userId ? s.upTo[userId] : undefined));
  return profile ? pendingLevelUp(profile, shownHere) : null;
}
