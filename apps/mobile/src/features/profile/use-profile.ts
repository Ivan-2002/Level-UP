import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateProfileInput, Profile } from "@levelup/shared";
import { ApiError, apiGet, apiPost } from "@/lib/api";

// Server state for the player's profile, via TanStack Query.
// The key includes the user id so one user's cached profile can never be shown to
// another user who signs in on the same phone.
export const profileQueryKey = (userId: string) => ["profile", userId] as const;

/**
 * The signed-in user's profile. `data` is:
 * - a Profile when they've created their character,
 * - null when they haven't yet (the API answers 404 ProfileNotFound),
 * - undefined while loading or after a real error (network, 500).
 * "No profile" is a normal answer, not an error, so it doesn't trigger retries or error UI.
 */
export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: profileQueryKey(userId ?? "anonymous"),
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      try {
        return await apiGet<Profile>("/profile");
      } catch (error) {
        if (error instanceof ApiError && error.code === "ProfileNotFound") return null;
        throw error;
      }
    },
  });
}

/** POST /profile. On success the new profile goes straight into the cache. */
export function useCreateProfile(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProfileInput) => apiPost<Profile>("/profile", input),
    onSuccess: (profile) => {
      // Writing the cache (instead of refetching) flips the route guard in
      // (app)/_layout.tsx right away, which moves the player to the home screen.
      queryClient.setQueryData(profileQueryKey(userId), profile);
    },
    onError: (error) => {
      // An earlier attempt already succeeded (e.g. the response was lost on bad signal):
      // refetch, and the guard moves the player on as if this request had worked.
      if (error instanceof ApiError && error.code === "ProfileExists") {
        void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
      }
    },
  });
}
