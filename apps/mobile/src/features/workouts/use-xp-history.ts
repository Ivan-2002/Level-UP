import { useMemo } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { BODYWEIGHT_FALLBACK_KG, exerciseXpHistoryListSchema, type DailyCapConfig, type ExerciseXpHistoryList } from "@levelup/shared";
import { apiGet } from "@/lib/api";
import { fetchWithDeviceCache, readCached } from "@/lib/device-cache";
import { useExercises } from "@/features/exercises/use-exercises";
import { useProfile } from "@/features/profile/use-profile";
import { useOutbox } from "@/stores/device-stores";
import { dayXpBefore, historyFromList, replayOutbox, xpHistoryCacheKey, type XpHistory } from "./xp-history";

// The XP history the live preview scores against (see xp-history.ts). The server's copy
// is saved on the phone PER PLAYER, so another account on the same phone never gets it;
// sign-out also clears the in-memory query cache.

export function xpHistoryQuery(userId: string) {
  return queryOptions({
    queryKey: ["xp-history", userId],
    queryFn: () => fetchWithDeviceCache(xpHistoryCacheKey(userId), exerciseXpHistoryListSchema, () => apiGet<ExerciseXpHistoryList>("/exercises/xp-history")),
    initialData: () => readCached(xpHistoryCacheKey(userId), exerciseXpHistoryListSchema),
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000, // it only changes when a workout reaches the server (which refetches it)
  });
}

export type XpPreviewData = {
  /** The server's history plus this player's queued workouts, replayed in order. */
  history: XpHistory;
  /**
   * The daily cap, with the server's values: the XP already counted on a local day (the
   * day a workout started, in the profile's time zone). Null when the saved copy is from
   * before the server sent cap data: no live cap then, as before.
   */
  dailyCap: { config: DailyCapConfig; xpBeforeOn: (day: string) => number } | null;
};

/** Undefined until the server's copy has loaded once (then it's on the phone). */
export function useXpHistory(userId: string): XpPreviewData | undefined {
  const { data: server } = useQuery(xpHistoryQuery(userId));
  const { data: library } = useExercises(userId);
  const { data: profile } = useProfile(userId);
  const items = useOutbox((s) => s.items);

  return useMemo(() => {
    if (!server) return undefined;
    const exercises = new Map((library ?? []).map((e) => [e.id, e]));
    const bodyweight = { xp: profile?.xpBodyweightKg ?? BODYWEIGHT_FALLBACK_KG, typed: profile?.bodyweightKg ?? BODYWEIGHT_FALLBACK_KG };
    const counted = new Set(server.today?.clientIds ?? []);
    const replayed = replayOutbox(historyFromList(server), items, userId, { exercises, bodyweight }, counted);
    const config = server.dailyCap;
    const timeZone = profile?.timeZone ?? "UTC";
    return {
      history: replayed.history,
      dailyCap: config
        ? { config, xpBeforeOn: (day: string) => dayXpBefore({ day, timeZone, today: server.today, cap: config, queued: replayed.workouts }) }
        : null,
    };
  }, [server, library, profile, items, userId]);
}
