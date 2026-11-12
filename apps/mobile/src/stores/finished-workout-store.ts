import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { FinishWorkoutResponse } from "@levelup/shared";
import type { ActiveWorkout } from "@/features/workouts/active-workout";

// The workout just finished, for the summary screen. Finish only puts the workout in the
// outbox; the server's summary (XP awarded, PRs, level, weekly goal) arrives when it
// syncs, which may be seconds later or, offline, much later. So we keep:
// - a snapshot of the workout, for a preview straight away, and
// - the server's response, attached when the outbox delivers it.
// Saved on the phone, so a summary still waiting for its response survives a restart.

export type FinishedWorkout = {
  clientId: string;
  userId: string;
  workout: ActiveWorkout;
  finishedAt: string;
  response: FinishWorkoutResponse | null;
};

type State = {
  last: FinishedWorkout | null;
  record: (workout: ActiveWorkout, finishedAt: Date) => void;
  /** The server's answer for a synced workout; ignored unless it's the one on record. */
  attachResponse: (clientId: string, response: FinishWorkoutResponse) => void;
};

export function createFinishedWorkoutStore(storage: StateStorage) {
  return createStore<State>()(
    persist(
      (set, get) => ({
        last: null,
        record: (workout, finishedAt) =>
          set({ last: { clientId: workout.clientId, userId: workout.userId, workout, finishedAt: finishedAt.toISOString(), response: null } }),
        attachResponse: (clientId, response) => {
          const last = get().last;
          if (last?.clientId === clientId) set({ last: { ...last, response } });
        },
      }),
      {
        name: "levelup.finished-workout",
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ last: state.last }),
      },
    ),
  );
}
