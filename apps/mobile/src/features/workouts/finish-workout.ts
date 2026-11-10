import type { ActiveWorkoutStore } from "@/stores/active-workout-store";
import { buildFinishPayload, type Result } from "./active-workout";
import type { OutboxStore } from "./outbox";

/**
 * "Finish workout": move the workout from in-progress into the outbox.
 *
 * Order matters for crash safety. Enqueue FIRST (saved), THEN clear the active workout.
 * If the app dies between the two, the worst case is the workout in both places; finishing
 * again enqueues the same clientId, which the outbox ignores and the server deduplicates.
 * The other order could lose the workout entirely.
 */
export function finishActiveWorkout(deps: {
  activeWorkout: ActiveWorkoutStore;
  outbox: OutboxStore;
  now: Date;
}): Result<{ clientId: string }> {
  const workout = deps.activeWorkout.getState().workout;
  if (!workout) return { ok: false, message: "No workout in progress." };

  const built = buildFinishPayload(workout, deps.now);
  if (!built.ok) return built;

  deps.outbox.getState().enqueue({
    clientId: workout.clientId,
    userId: workout.userId,
    payload: built.value,
    queuedAt: deps.now.toISOString(),
  });
  deps.activeWorkout.getState().clear();
  return { ok: true, value: { clientId: workout.clientId } };
}
