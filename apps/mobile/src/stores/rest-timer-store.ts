import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import * as rest from "@/features/workouts/rest-timer";
import type { RestTimer } from "@/features/workouts/rest-timer";

// The rest timer, saved on the phone like the workout (a killed app comes back mid-rest),
// plus the one scheduled "rest is over" notification. Every change cancels the old
// notification and schedules a new one for the new end time, so Skip, +30s and Pause can
// never leave a stale alert behind.

/** Where notifications come from: expo-notifications in the app, a fake in tests. */
export type RestNotifier = {
  /** Schedules the alert; resolves with its id, or null if notifications aren't allowed. */
  schedule: (at: Date, body: string) => Promise<string | null>;
  cancel: (id: string) => Promise<void>;
};

export type RestTimerState = {
  timer: RestTimer;
  notificationId: string | null;
  /** Shown in the notification: "Next: set 3 · 62.5 kg × 7". */
  nextText: string;
  start: (durationSec: number, nextText: string) => void;
  addTime: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
};

export type RestTimerStore = ReturnType<typeof createRestTimerStore>;

export function createRestTimerStore(deps: { storage: StateStorage; now: () => number; notifier: RestNotifier }) {
  // Each change gets a number; a schedule() that resolves after a NEWER change is stale,
  // and its notification is cancelled straight away instead of being kept.
  let generation = 0;

  return createStore<RestTimerState>()(
    persist(
      (set, get) => {
        const apply = (timer: RestTimer, nextText = get().nextText) => {
          const previous = get().notificationId;
          if (previous) void deps.notifier.cancel(previous);
          const mine = ++generation;
          set({ timer, nextText, notificationId: null });

          const at = rest.notifyAt(timer, deps.now());
          if (at === null) return;
          void deps.notifier
            .schedule(new Date(at), nextText ? `Next: ${nextText}` : "Time for your next set.")
            .then((id) => {
              if (!id) return;
              if (mine === generation) set({ notificationId: id });
              else void deps.notifier.cancel(id);
            });
        };

        return {
          timer: rest.IDLE,
          notificationId: null,
          nextText: "",
          start: (durationSec, nextText) => apply(rest.startRest(durationSec, deps.now()), nextText),
          addTime: (seconds) => apply(rest.addRest(get().timer, seconds, deps.now())),
          pause: () => apply(rest.pauseRest(get().timer, deps.now())),
          resume: () => apply(rest.resumeRest(get().timer, deps.now())),
          skip: () => apply(rest.IDLE),
        };
      },
      {
        name: "levelup.rest-timer",
        version: 1,
        storage: createJSONStorage(() => deps.storage),
        partialize: (state) => ({ timer: state.timer, notificationId: state.notificationId, nextText: state.nextText }),
      },
    ),
  );
}
