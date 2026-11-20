import type { FinishWorkoutInput } from "@levelup/shared";
import type { ActiveWorkoutStore } from "@/stores/active-workout-store";
import { buildFinishPayload, type ActiveWorkout, type Result } from "./active-workout";
import { exercisesOf, previewFromPayload, scoringContext, type SavedPreview } from "./live-workout";
import type { OutboxStore } from "./outbox";

export type FinishedResult = {
  clientId: string;
  /** The workout as sent: after editing ended (a pending valid edit included). */
  workout: ActiveWorkout;
  payload: FinishWorkoutInput;
  /** The summary's XP until the server answers; null if no scoring context was ever pinned. */
  preview: SavedPreview | null;
};

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
}): Result<FinishedResult> {
  // Finishing ends editing: a valid edit to a done set is scored before the workout is sent.
  deps.activeWorkout.getState().endEditing();
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
  const preview = workout.scoring ? previewFromPayload(built.value, exercisesOf(workout), scoringContext(workout.scoring)) : null;
  return { ok: true, value: { clientId: workout.clientId, workout, payload: built.value, preview } };
}
