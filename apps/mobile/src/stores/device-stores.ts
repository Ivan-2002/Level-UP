import * as Crypto from "expo-crypto";
import { useStore } from "zustand";
import { deviceStorage } from "@/lib/storage";
import { createActiveWorkoutStore, type ActiveWorkoutState } from "./active-workout-store";
import { createOutboxStore } from "./outbox-store";
import { createSettingsStore, type SettingsState } from "./settings-store";
import { createRestTimerStore, type RestTimerState } from "./rest-timer-store";
import { createFinishedWorkoutStore } from "./finished-workout-store";
import { createCelebrationStore, type CelebrationState } from "./celebration-store";
import { restNotifier } from "@/features/workouts/rest-notifications";
import type { OutboxState } from "@/features/workouts/outbox";

// The app's one instance of each store, saved to the phone. (Tests build their own with
// in-memory storage from the factories, so they never touch this file.)

export const activeWorkoutStore = createActiveWorkoutStore({
  storage: deviceStorage,
  newId: () => Crypto.randomUUID(), // v4 UUID: the API checks clientId is a UUID
  now: () => new Date(),
});

export const outboxStore = createOutboxStore(deviceStorage);

export const settingsStore = createSettingsStore(deviceStorage);

export const finishedWorkoutStore = createFinishedWorkoutStore(deviceStorage);

export const celebrationStore = createCelebrationStore(deviceStorage);

export const restTimerStore = createRestTimerStore({ storage: deviceStorage, now: Date.now, notifier: restNotifier });

// React hooks: re-render only when the selected part changes.
export const useActiveWorkout = <T>(selector: (state: ActiveWorkoutState) => T) =>
  useStore(activeWorkoutStore, selector);
export const useOutbox = <T>(selector: (state: OutboxState) => T) => useStore(outboxStore, selector);
export const useSettings = <T>(selector: (state: SettingsState) => T) => useStore(settingsStore, selector);
export const useRestTimer = <T>(selector: (state: RestTimerState) => T) => useStore(restTimerStore, selector);
export const useCelebration = <T>(selector: (state: CelebrationState) => T) => useStore(celebrationStore, selector);
export const useFinishedWorkout = <T>(selector: (state: ReturnType<typeof finishedWorkoutStore.getState>) => T) =>
  useStore(finishedWorkoutStore, selector);
