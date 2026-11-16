import { queryOptions, useQuery } from "@tanstack/react-query";
import { exerciseSummarySchema, type ExerciseSummary } from "@levelup/shared";
import { apiGet } from "@/lib/api";
import { fetchWithDeviceCache, readCached } from "@/lib/device-cache";

// An exercise's history for the active workout: last time's sets, the best estimated
// 1RM (for the PR chip and live PRs) and the last sessions (the trend chart). Saved on
// the phone, so it still shows at the gym once it has been loaded.

/** Sessions on the trend chart; today is drawn as one more bar. */
const SESSIONS = 5;

/** The full history screen asks for more sessions (the most the API allows). */
export const HISTORY_SESSIONS = 100;

export function exerciseSummaryQuery(userId: string, exerciseId: string, sessions = SESSIONS) {
  const key = `levelup.exercise-summary.${userId}.${exerciseId}.${sessions}`;
  return queryOptions({
    queryKey: ["exercise-summary", userId, exerciseId, sessions],
    queryFn: () =>
      fetchWithDeviceCache(key, exerciseSummarySchema, () => apiGet<ExerciseSummary>(`/exercises/${exerciseId}/summary?sessions=${sessions}`)),
    initialData: () => readCached(key, exerciseSummarySchema),
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000, // history only changes when a workout syncs (which refreshes it)
  });
}

export function useExerciseSummary(userId: string, exerciseId: string | undefined, sessions = SESSIONS) {
  return useQuery({ ...exerciseSummaryQuery(userId, exerciseId ?? "none", sessions), enabled: !!exerciseId });
}
