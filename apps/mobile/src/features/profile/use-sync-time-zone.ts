import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCalendars } from "expo-localization";
import type { Profile } from "@levelup/shared";
import { apiPatch } from "@/lib/api";
import { profileQueryKey } from "./use-profile";

/** The phone's IANA time zone, e.g. "Africa/Johannesburg" (UTC if it won't say). */
export function useDeviceTimeZone(): string {
  return useCalendars()[0]?.timeZone ?? "UTC";
}

/**
 * Weeks and training days count in the player's time zone, which the server keeps on the
 * profile. When the phone's zone differs (travel, or a profile from before time zones
 * were stored), tell the server. useCalendars re-renders when the phone's setting changes.
 * Failures are ignored: it is retried next time the app opens.
 */
export function useSyncTimeZone(userId: string | undefined, profile: Profile | null | undefined): void {
  const timeZone = useDeviceTimeZone();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !profile || profile.timeZone === timeZone) return;
    apiPatch<Profile>("/profile", { timeZone })
      .then((updated) => {
        queryClient.setQueryData(profileQueryKey(userId), updated);
        void queryClient.invalidateQueries({ queryKey: ["weekly-goal"] });
      })
      .catch((error) => console.warn("[profile] couldn't update the time zone:", error));
  }, [userId, profile, timeZone, queryClient]);
}
