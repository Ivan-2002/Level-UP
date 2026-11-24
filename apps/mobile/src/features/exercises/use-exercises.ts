import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  exerciseListSchema,
  type CreateExerciseInput,
  type Exercise,
  type ExerciseList,
  type RecentExerciseList,
} from "@levelup/shared";
import { apiGet, apiPost } from "@/lib/api";
import { fetchWithDeviceCache, readCached, removeCached, writeCached } from "@/lib/device-cache";

// The exercise library, cached on the phone so the picker works offline (at the gym).
// See lib/device-cache.ts for how. `initialDataUpdatedAt: 0` marks the saved copy as old,
// so a fresh copy is fetched whenever there's a connection.
//
// Keyed per player: the list holds their custom exercises and their rest times, so
// another account on the same phone must never get it. (Until 4b it was one key for
// everyone: "levelup.exercises", deleted on the next fetch.)

const cacheKey = (userId: string) => `levelup.exercises.${userId}`;
const LEGACY_CACHE_KEY = "levelup.exercises";

export function exercisesQuery(userId: string) {
  return queryOptions({
    queryKey: ["exercises", "library", userId],
    queryFn: async (): Promise<Exercise[]> => {
      removeCached(LEGACY_CACHE_KEY);
      return (
        await fetchWithDeviceCache(cacheKey(userId), exerciseListSchema, () => apiGet<ExerciseList>("/exercises"))
      ).items;
    },
    initialData: () => readCached(cacheKey(userId), exerciseListSchema)?.items,
    initialDataUpdatedAt: 0,
    staleTime: 60 * 60 * 1000, // the library rarely changes: refresh at most hourly
  });
}

export function useExercises(userId: string) {
  return useQuery(exercisesQuery(userId));
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
export function useCreateExercise(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExerciseInput) => apiPost<Exercise>("/exercises", input),
    onSuccess: (created) => {
      const { queryKey } = exercisesQuery(userId);
      const items = [...(queryClient.getQueryData<Exercise[]>(queryKey) ?? []), created];
      queryClient.setQueryData(queryKey, items);
      writeCached(cacheKey(userId), { items });
    },
  });
}
