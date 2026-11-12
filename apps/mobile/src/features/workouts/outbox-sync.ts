import { useEffect } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import type { FinishWorkoutResponse } from "@levelup/shared";
import { apiPost } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { outboxStore } from "@/stores/device-stores";
import { createOutboxProcessor, type OutboxProcessor } from "./outbox";

// Connects the plain-TypeScript outbox to the real world: the API, timers, and the events
// that mean "worth trying again". The retry RULES live in outbox.ts (unit-tested).

let current: OutboxProcessor | null = null;

/** Try to send queued workouts now (e.g. right after Finish). No-op when signed out. */
export function syncOutboxNow(): void {
  void current?.flush();
}

/**
 * Runs the outbox for the signed-in user while mounted. Sync is attempted:
 * - right away (sign-in / app launch),
 * - when the app returns to the foreground,
 * - when the phone regains a connection,
 * - when a retry wait ends (timers inside the processor),
 * - after Finish (syncOutboxNow).
 */
export function useOutboxSync(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;

    const processor = createOutboxProcessor({
      store: outboxStore,
      send: (payload) => apiPost<FinishWorkoutResponse>("/workouts", payload),
      getUserId: () => userId,
      now: Date.now,
      random: Math.random,
      setTimer: (callback, ms) => setTimeout(callback, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      // A workout arrived: refresh what it changes. History reads ["workouts"]; the
      // weekly goal may now be met (and waits for an empty outbox, see weekly-goal-gate.ts).
      onSynced: () => {
        void queryClient.invalidateQueries({ queryKey: ["workouts"] });
        void queryClient.invalidateQueries({ queryKey: ["weekly-goal"] });
      },
    });
    current = processor;
    void processor.flush();

    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void processor.flush();
    });
    const network = Network.addNetworkStateListener((state) => {
      if (state.isConnected) void processor.flush();
    });

    return () => {
      appState.remove();
      network.remove();
      processor.dispose();
      if (current === processor) current = null;
    };
  }, [userId]);
}
