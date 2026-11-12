import * as Crypto from "expo-crypto";
import { useStore } from "zustand";
import { deviceStorage } from "@/lib/storage";
import { createActiveWorkoutStore, type ActiveWorkoutState } from "./active-workout-store";
import { createOutboxStore } from "./outbox-store";
import { createSettingsStore, type SettingsState } from "./settings-store";
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

// React hooks: re-render only when the selected part changes.
export const useActiveWorkout = <T>(selector: (state: ActiveWorkoutState) => T) =>
  useStore(activeWorkoutStore, selector);
export const useOutbox = <T>(selector: (state: OutboxState) => T) => useStore(outboxStore, selector);
export const useSettings = <T>(selector: (state: SettingsState) => T) => useStore(settingsStore, selector);
