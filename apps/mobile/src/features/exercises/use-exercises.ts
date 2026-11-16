import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { exerciseListSchema, type CreateExerciseInput, type Exercise, type ExerciseList, type RecentExerciseList } from "@levelup/shared";
import { apiGet, apiPost } from "@/lib/api";
import { fetchWithDeviceCache, readCached, writeCached } from "@/lib/device-cache";

// The exercise library, cached on the phone so the picker works offline (at the gym).
// See lib/device-cache.ts for how. `initialDataUpdatedAt: 0` marks the saved copy as old,
// so a fresh copy is fetched whenever there's a connection.

const CACHE_KEY = "levelup.exercises";

export const exercisesQuery = queryOptions({
  queryKey: ["exercises"],
  queryFn: async (): Promise<Exercise[]> =>
    (await fetchWithDeviceCache(CACHE_KEY, exerciseListSchema, () => apiGet<ExerciseList>("/exercises"))).items,
  initialData: () => readCached(CACHE_KEY, exerciseListSchema)?.items,
  initialDataUpdatedAt: 0,
  staleTime: 60 * 60 * 1000, // the library rarely changes: refresh at most hourly
});

export function useExercises() {
  return useQuery(exercisesQuery);
}

/** "Recently used" with last numbers. Online only: the sheet works fine without it. */
export function useRecentExercises(userId: string) {
  return useQuery({
    queryKey: ["exercises", "recent", userId],
    queryFn: () => apiGet<RecentExerciseList>("/exercises/recent"),
    retry: false,
  });
}

/** POST /exercises (a custom exercise). It joins the cached library straight away. */
export function useCreateExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExerciseInput) => apiPost<Exercise>("/exercises", input),
    onSuccess: (created) => {
      const items = [...(queryClient.getQueryData<Exercise[]>(exercisesQuery.queryKey) ?? []), created];
      queryClient.setQueryData(exercisesQuery.queryKey, items);
      writeCached(CACHE_KEY, { items });
    },
  });
}
