import { useQuery } from "@tanstack/react-query";
import { avatarResponseSchema, type AvatarResponse } from "@levelup/shared";
import { apiGet } from "@/lib/api";
import { fetchWithDeviceCache, readCached } from "@/lib/device-cache";

// GET /v1/avatar: the player's development per body part and every stage (the level-up
// screen draws the OLD stage's extras from them). Like the profile, it's saved on the
// phone per player, so Home draws the avatar at once and with no signal; the outbox
// refetches it when a workout syncs (outbox-sync.ts), and opening the app refreshes it,
// which is what moves shrinking along (it's evaluated on the server's "today").

export const avatarQueryKey = (userId: string) => ["avatar", userId] as const;
const cacheKey = (userId: string) => `levelup.avatar.${userId}`;

export function useAvatar(userId: string | undefined) {
  return useQuery({
    queryKey: avatarQueryKey(userId ?? "anonymous"),
    enabled: !!userId,
    initialData: () => (userId ? readCached(cacheKey(userId), avatarResponseSchema) : undefined),
    initialDataUpdatedAt: 0, // shown at once, refreshed whenever there's a connection
    queryFn: () =>
      fetchWithDeviceCache(cacheKey(userId!), avatarResponseSchema, () => apiGet<AvatarResponse>("/avatar")),
  });
}
