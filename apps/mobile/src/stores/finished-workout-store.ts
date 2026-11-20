import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { FinishWorkoutResponse, LevelStatus } from "@levelup/shared";
import type { ActiveWorkout } from "@/features/workouts/active-workout";
import type { SavedPreview } from "@/features/workouts/live-workout";

// The workout just finished, for the summary screen. Finish only puts the workout in the
// outbox; the server's summary (XP awarded, PRs, level, weekly goal) arrives when it
// syncs, which may be seconds later or, offline, much later. So we keep:
// - a snapshot of the workout and its live score (the preview), shown straight away, and
// - the server's response, attached when the outbox delivers it.
// Saved on the phone, so a summary still waiting for its response survives a restart.
// Only the LAST finished workout is kept: finishing another replaces it (the earlier one's
// summary is still in the history, from the server).

export type FinishedWorkout = {
  clientId: string;
  userId: string;
  /** As sent: after editing ended. */
  workout: ActiveWorkout;
  /** The finish time sent (the last tick's time for a workout longer than 6 hours). */
  finishedAt: string;
  /** The live score saved at Finish; null when there was none (no history ever pinned, or saved by store v1). */
  preview: SavedPreview | null;
  /** The level status the phone had cached at Finish (profile.level), for the pending bar; null if none. */
  levelBefore: LevelStatus | null;
  response: FinishWorkoutResponse | null;
};

type State = {
  last: FinishedWorkout | null;
  record: (finished: Omit<FinishedWorkout, "clientId" | "userId" | "response">) => void;
  /** The server's answer for a synced workout; ignored unless it's the one on record. */
  attachResponse: (clientId: string, response: FinishWorkoutResponse) => void;
};

export function createFinishedWorkoutStore(storage: StateStorage) {
  return createStore<State>()(
    persist(
      (set, get) => ({
        last: null,
        record: (finished) => set({ last: { clientId: finished.workout.clientId, userId: finished.workout.userId, ...finished, response: null } }),
        attachResponse: (clientId, response) => {
          const last = get().last;
          if (last?.clientId === clientId) set({ last: { ...last, response } });
        },
      }),
      {
        name: "levelup.finished-workout",
        // v2 (Milestone 5): the saved preview and the cached level status.
        version: 2,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ last: state.last }),
        migrate: (persisted, version) => {
          const state = persisted as { last: FinishedWorkout | null };
          // v1 had no preview: show no estimate rather than the old one (plain set XP, no effort or caps).
          if (version < 2 && state.last) return { last: { ...state.last, preview: null, levelBefore: null } };
          return state;
        },
      },
    ),
  );
}
