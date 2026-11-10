import Storage from "expo-sqlite/kv-store";
import type { StateStorage } from "zustand/middleware";

// Device storage for app state that isn't secret (the workout in progress, the outbox,
// the cached exercise list). expo-sqlite's kv-store is Expo's recommended drop-in for
// AsyncStorage in SDK 58. Session tokens stay in SecureStore (see auth-client.ts).
//
// We use the SYNCHRONOUS methods on purpose:
// - Reading: Zustand restores saved state before the first render, so the
//   "Resume workout" card never pops in late.
// - Writing: when a call returns, the data is on disk. Finish moves a workout into the
//   outbox; if the app is killed a millisecond later, it is still there.
// The cost is a tiny write on the JS thread per change, fine for a few KB of JSON.
export const deviceStorage: StateStorage = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => {
    Storage.setItemSync(key, value);
  },
  removeItem: (key) => {
    Storage.removeItemSync(key);
  },
};
