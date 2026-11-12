import type { OutboxItem } from "@/features/workouts/outbox";

/**
 * Whether to ask the server for this week's goal yet. Asking also rolls finished weeks
 * over, and a closed week is final. So while a workout from this phone is still waiting
 * in the outbox (logged offline on Sunday, say), we wait: once it arrives, it counts for
 * its week. Items that "need attention" don't block, or one bad workout would hide the
 * goal forever.
 */
export function canLoadWeeklyGoal(items: Pick<OutboxItem, "userId" | "status">[], userId: string): boolean {
  return !items.some((item) => item.userId === userId && item.status === "pending");
}
