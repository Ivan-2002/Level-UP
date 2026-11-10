import type { StateStorage } from "zustand/middleware";
import type { Exercise } from "@levelup/shared";

// Test-only helpers for the plain-TypeScript workout logic.

/** In-memory stand-in for the phone's kv-store. Share one between two stores to simulate a restart. */
export function memoryStorage(): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** The n-th id from sequentialIds(): a valid, predictable UUID v4. */
export const testUuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Predictable ids that are still real UUIDs (the shared schema checks clientId). */
export function sequentialIds() {
  let n = 0;
  return () => testUuid(++n);
}

export const benchPress: Exercise = {
  id: "0195f3a0-0000-7000-8000-000000000001",
  name: "Bench Press",
  muscleGroup: "Chest",
  bodyPart: "chest",
  equipment: "barbell",
  repsUnit: "reps",
};

export const pullUp: Exercise = {
  id: "0195f3a0-0000-7000-8000-000000000002",
  name: "Pull-up",
  muscleGroup: "Lats",
  bodyPart: "back",
  equipment: "bodyweight",
  repsUnit: "reps",
};

export const plank: Exercise = {
  id: "0195f3a0-0000-7000-8000-000000000003",
  name: "Plank",
  muscleGroup: "Abs",
  bodyPart: "core",
  equipment: "bodyweight",
  repsUnit: "seconds",
};

export const lateralRaise: Exercise = {
  id: "0195f3a0-0000-7000-8000-000000000004",
  name: "Lateral Raise",
  muscleGroup: "Side delts",
  bodyPart: "shoulders",
  equipment: "dumbbell",
  repsUnit: "reps",
};
