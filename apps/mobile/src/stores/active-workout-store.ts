import type { Exercise, Routine, WeightUnit } from "@levelup/shared";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import * as workout from "@/features/workouts/active-workout";
import type { ActiveWorkout, LastSets } from "@/features/workouts/active-workout";

// The workout in progress, saved on the phone after every change, so it survives the app
// being killed. The rules live in features/workouts/active-workout.ts; this store only
// holds the current value and saves it.

export type ActiveWorkoutState = {
  workout: ActiveWorkout | null;
  /** Starts an empty workout. Does nothing if this user already has one going. */
  start: (userId: string, weightUnit: WeightUnit) => void;
  /** Starts from a routine, pre-filled. Does nothing if this user already has a workout going. */
  startFromRoutine: (userId: string, weightUnit: WeightUnit, routine: Routine, lastSets?: LastSets) => void;
  rename: (name: string) => void;
  linkRoutine: (routineId: string) => void;
  /** Several at once, in the order given (the Add exercise sheet's multi-select); opens the first. */
  addExercises: (exercises: Exercise[], lastSets?: LastSets) => void;
  removeExercise: (exerciseKey: string) => void;
  selectExercise: (exerciseKey: string) => void;
  stepRest: (exerciseKey: string, direction: -1 | 1) => void;
  addSet: (exerciseKey: string) => void;
  removeSet: (exerciseKey: string, setKey: string) => void;
  updateSet: (exerciseKey: string, setKey: string, changes: { weight?: string; reps?: string }) => void;
  /** Returns an error message if the set's values aren't valid yet. */
  toggleSetDone: (exerciseKey: string, setKey: string) => string | null;
  /** Saves the live preview's scoring context, once per workout (later calls do nothing). */
  pinScoring: (scoring: workout.PinnedScoring) => void;
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
        const busy = (userId: string) => get().workout?.userId === userId; // never replace it by accident

        return {
          workout: null,
          start: (userId, weightUnit) => {
            if (busy(userId)) return;
            set({ workout: workout.startWorkout({ userId, clientId: deps.newId(), now: deps.now(), weightUnit }) });
          },
          startFromRoutine: (userId, weightUnit, routine, lastSets) => {
            if (busy(userId)) return;
            set({ workout: workout.startFromRoutine({ userId, clientId: deps.newId(), now: deps.now(), weightUnit, routine, lastSets, newId: deps.newId }) });
          },
          rename: (name) => update((w) => ({ ...w, name })),
          linkRoutine: (routineId) => update((w) => workout.linkRoutine(w, routineId)),
          addExercises: (exercises, lastSets) => update((w) => workout.addExercises(w, exercises, deps.newId, lastSets)),
          removeExercise: (key) => update((w) => workout.removeExercise(w, key)),
          selectExercise: (key) => update((w) => workout.selectExercise(w, key)),
          stepRest: (key, direction) => update((w) => workout.stepRest(w, key, direction)),
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
          pinScoring: (scoring) => update((w) => workout.pinScoring(w, scoring)),
          clear: () => set({ workout: null }),
        };
      },
      {
        name: "levelup.active-workout",
        // v2: weights typed in the player's unit, targets, rest per exercise, current exercise.
        // v3: the live preview's pinned scoring context (ActiveWorkout.scoring).
        version: 3,
        // A workout in progress must survive an app update: upgrade older saved shapes,
        // one version at a time (v1 -> v2 -> v3).
        migrate: (saved, version) => {
          const state = saved as { workout?: unknown };
          let current = state.workout ?? null;
          if (version < 2) current = workout.migrateV1(current);
          if (version < 3) current = workout.migrateV2(current);
          return { workout: current as ActiveWorkout | null };
        },
        storage: createJSONStorage(() => deps.storage),
        partialize: (state) => ({ workout: state.workout }),
      },
    ),
  );
}
