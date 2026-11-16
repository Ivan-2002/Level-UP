import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  lastSessionListSchema,
  routineListSchema,
  routineSchema,
  type LastSessionList,
  type Routine,
  type RoutineInput,
  type RoutineList,
} from "@levelup/shared";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { fetchWithDeviceCache, readCached, removeCached, writeCached } from "@/lib/device-cache";

// Server state for routines (TanStack Query), saved on the phone too: at the gym with
// no signal you can still open a routine and start it. Creating, editing and deleting
// need a connection (they're rare, and doing them offline would need a second outbox).

const keys = {
  all: (userId: string) => ["routines", userId] as const,
  list: (userId: string) => ["routines", userId, "list"] as const,
  detail: (userId: string, id: string) => ["routines", userId, "detail", id] as const,
  lastSessions: (userId: string, ids: string[]) => ["last-sessions", userId, ids.join(",")] as const,
};
const cacheKey = {
  list: (userId: string) => `levelup.routines.${userId}`,
  detail: (userId: string, id: string) => `levelup.routine.${userId}.${id}`,
  lastSessions: (userId: string, ids: string[]) => `levelup.last-sessions.${userId}.${ids.join(",")}`,
};

export function useRoutines(userId: string) {
  return useQuery({
    queryKey: keys.list(userId),
    queryFn: () => fetchWithDeviceCache(cacheKey.list(userId), routineListSchema, () => apiGet<RoutineList>("/routines")),
    initialData: () => readCached(cacheKey.list(userId), routineListSchema),
    initialDataUpdatedAt: 0,
  });
}

/** One routine. Pass null (a routine not created yet) to skip loading. */
export function useRoutine(userId: string, id: string | null) {
  return useQuery({
    queryKey: keys.detail(userId, id ?? "new"),
    enabled: id !== null,
    queryFn: () => fetchWithDeviceCache(cacheKey.detail(userId, id!), routineSchema, () => apiGet<Routine>(`/routines/${id}`)),
    initialData: () => (id === null ? undefined : readCached(cacheKey.detail(userId, id), routineSchema)),
    initialDataUpdatedAt: 0,
  });
}

/** Each exercise's last session (for "Last: 62.5 kg × 8" and pre-filling Start). */
export function useLastSessions(userId: string, exerciseIds: string[]) {
  const ids = [...new Set(exerciseIds)];
  return useQuery({
    queryKey: keys.lastSessions(userId, ids),
    enabled: ids.length > 0,
    queryFn: () =>
      fetchWithDeviceCache(cacheKey.lastSessions(userId, ids), lastSessionListSchema, () =>
        apiGet<LastSessionList>(`/exercises/last-sessions?ids=${ids.join(",")}`),
      ),
    initialData: () => readCached(cacheKey.lastSessions(userId, ids), lastSessionListSchema),
    initialDataUpdatedAt: 0,
  });
}

/** Create (no id) or replace (with id). The saved routine goes straight into the cache. */
export function useSaveRoutine(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: RoutineInput }) =>
      id ? apiPut<Routine>(`/routines/${id}`, input) : apiPost<Routine>("/routines", input),
    onSuccess: (routine) => {
      queryClient.setQueryData(keys.detail(userId, routine.id), routine);
      writeCached(cacheKey.detail(userId, routine.id), routine);
      void queryClient.invalidateQueries({ queryKey: keys.list(userId) });
    },
  });
}

export function useDeleteRoutine(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/routines/${id}`),
    onSuccess: (_result, id) => {
      removeCached(cacheKey.detail(userId, id));
      queryClient.removeQueries({ queryKey: keys.detail(userId, id) });
      void queryClient.invalidateQueries({ queryKey: keys.list(userId) });
    },
  });
}

