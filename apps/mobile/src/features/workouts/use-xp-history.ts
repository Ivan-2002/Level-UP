import { useMemo } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { BODYWEIGHT_FALLBACK_KG, exerciseXpHistoryListSchema, type ExerciseXpHistoryList } from "@levelup/shared";
import { apiGet } from "@/lib/api";
import { fetchWithDeviceCache, readCached } from "@/lib/device-cache";
import { useExercises } from "@/features/exercises/use-exercises";
import { useProfile } from "@/features/profile/use-profile";
import { useOutbox } from "@/stores/device-stores";
import { effectiveXpHistory, historyFromList, type XpHistory } from "./xp-history";

// The XP history the live preview scores against (see xp-history.ts). The server's copy
// is saved on the phone PER PLAYER, so another account on the same phone never gets it;
// sign-out also clears the in-memory query cache.

const cacheKey = (userId: string) => `levelup.xp-history.${userId}`;

export function xpHistoryQuery(userId: string) {
  return queryOptions({
    queryKey: ["xp-history", userId],
    queryFn: () => fetchWithDeviceCache(cacheKey(userId), exerciseXpHistoryListSchema, () => apiGet<ExerciseXpHistoryList>("/exercises/xp-history")),
    initialData: () => readCached(cacheKey(userId), exerciseXpHistoryListSchema),
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000, // it only changes when a workout reaches the server (which refetches it)
  });
}

/**
 * The server's history plus this player's workouts still in the outbox, replayed in
 * order. Undefined until the server's copy has loaded once (then it's on the phone).
 */
export function useXpHistory(userId: string): XpHistory | undefined {
  const { data: server } = useQuery(xpHistoryQuery(userId));
  const { data: library } = useExercises(userId);
  const { data: profile } = useProfile(userId);
  const items = useOutbox((s) => s.items);

  return useMemo(() => {
    if (!server) return undefined;
    const exercises = new Map((library ?? []).map((e) => [e.id, e]));
    const bodyweight = { xp: profile?.xpBodyweightKg ?? BODYWEIGHT_FALLBACK_KG, typed: profile?.bodyweightKg ?? BODYWEIGHT_FALLBACK_KG };
    return effectiveXpHistory(historyFromList(server), items, userId, { exercises, bodyweight });
  }, [server, library, profile, items, userId]);
}
