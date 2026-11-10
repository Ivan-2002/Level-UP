import type { Exercise } from "@levelup/shared";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import * as workout from "@/features/workouts/active-workout";
import type { ActiveWorkout } from "@/features/workouts/active-workout";

// The workout in progress, saved on the phone after every change, so it survives the app
// being killed. The rules live in features/workouts/active-workout.ts; this store only
// holds the current value and saves it.

export type ActiveWorkoutState = {
  workout: ActiveWorkout | null;
  start: (userId: string) => void;
  rename: (name: string) => void;
  addExercise: (exercise: Exercise) => void;
  removeExercise: (exerciseKey: string) => void;
  addSet: (exerciseKey: string) => void;
  removeSet: (exerciseKey: string, setKey: string) => void;
  updateSet: (exerciseKey: string, setKey: string, changes: { weightKg?: string; reps?: string }) => void;
  /** Returns an error message if the set's values aren't valid yet. */
  toggleSetDone: (exerciseKey: string, setKey: string) => string | null;
  /** Throws the workout away (after the user confirmed), or clears it once it's in the outbox. */
  clear: () => void;
};

export type ActiveWorkoutStore = ReturnType<typeof createActiveWorkoutStore>;

export function createActiveWorkoutStore(deps: { storage: StateStorage; newId: () => string; now: () => Date }) {
  return createStore<ActiveWorkoutState>()(
    persist(
      (set, get) => {
        const update = (change: (current: ActiveWorkout) => ActiveWorkout) => {
          const current = get().workout;
          if (current) set({ workout: change(current) });
        };

        return {
          workout: null,
          start: (userId) => {
            // Never replace this user's unfinished workout by accident.
            if (get().workout?.userId === userId) return;
            set({ workout: workout.startWorkout({ userId, clientId: deps.newId(), now: deps.now() }) });
          },
          rename: (name) => update((w) => ({ ...w, name })),
          addExercise: (exercise) => update((w) => workout.addExercise(w, exercise, deps.newId)),
          removeExercise: (key) => update((w) => workout.removeExercise(w, key)),
          addSet: (key) => update((w) => workout.addSet(w, key, deps.newId)),
          removeSet: (key, setKey) => update((w) => workout.removeSet(w, key, setKey)),
          updateSet: (key, setKey, changes) => update((w) => workout.updateSet(w, key, setKey, changes)),
          toggleSetDone: (key, setKey) => {
            const current = get().workout;
            if (!current) return "No workout in progress.";
            const result = workout.toggleSetDone(current, key, setKey, deps.now());
            if (!result.ok) return result.message;
            set({ workout: result.value });
            return null;
          },
          clear: () => set({ workout: null }),
        };
      },
      {
        name: "levelup.active-workout",
        version: 1, // bump with a `migrate` function if ActiveWorkout's shape changes
        storage: createJSONStorage(() => deps.storage),
        partialize: (state) => ({ workout: state.workout }),
      },
    ),
  );
}
