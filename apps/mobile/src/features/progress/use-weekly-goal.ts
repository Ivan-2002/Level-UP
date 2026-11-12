import { useQuery } from "@tanstack/react-query";
import type { WeeklyGoalStatus } from "@levelup/shared";
import { apiGet } from "@/lib/api";
import { useOutbox } from "@/stores/device-stores";
import { canLoadWeeklyGoal } from "./weekly-goal-gate";

// This week's goal and streak, from the server (which also rolls finished weeks over:
// there is no scheduled job, opening the app is what moves the weeks along).
export const weeklyGoalQueryKey = (userId: string) => ["weekly-goal", userId] as const;

export function useWeeklyGoal(userId: string) {
  const ready = useOutbox((s) => canLoadWeeklyGoal(s.items, userId));
  return useQuery({
    queryKey: weeklyGoalQueryKey(userId),
    enabled: ready, // runs as soon as the outbox is empty (see weekly-goal-gate.ts)
    queryFn: () => apiGet<WeeklyGoalStatus>("/weekly-goal"),
  });
}
