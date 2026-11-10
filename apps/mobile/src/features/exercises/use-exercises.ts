import { queryOptions, useQuery } from "@tanstack/react-query";
import Storage from "expo-sqlite/kv-store";
import { exerciseListSchema, type Exercise, type ExerciseList } from "@levelup/shared";
import { apiGet } from "@/lib/api";

// The exercise library, cached on the phone so the picker works offline (at the gym).
//
// - Every successful GET /exercises is saved to device storage.
// - When the request fails (offline), the saved copy is used instead.
// - The saved copy is also the query's starting data, so the picker opens instantly;
//   `initialDataUpdatedAt: 0` marks it as old, so a fresh copy is fetched when possible.
// The cached copy is re-checked against the shared schema when read: if an app update
// changed the Exercise shape, an old cache is thrown away instead of crashing the picker.

const CACHE_KEY = "levelup.exercises";

function readCache(): Exercise[] | undefined {
  try {
    const raw = Storage.getItemSync(CACHE_KEY);
    return raw ? exerciseListSchema.parse(JSON.parse(raw)).items : undefined;
  } catch {
    return undefined;
  }
}

export const exercisesQuery = queryOptions({
  queryKey: ["exercises"],
  queryFn: async (): Promise<Exercise[]> => {
    try {
      const list = await apiGet<ExerciseList>("/exercises");
      Storage.setItemSync(CACHE_KEY, JSON.stringify(list));
      return list.items;
    } catch (error) {
      const cached = readCache();
      if (cached) return cached;
      throw error; // never fetched before AND offline: nothing to show
    }
  },
  initialData: readCache,
  initialDataUpdatedAt: 0,
  staleTime: 60 * 60 * 1000, // the library rarely changes: refresh at most hourly
});

export function useExercises() {
  return useQuery(exercisesQuery);
}
