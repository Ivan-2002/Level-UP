import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { OutboxItem, OutboxState } from "@/features/workouts/outbox";

// The outbox, saved on the phone. A factory (not a single instance) so tests can give it
// in-memory storage; the app's instance lives in device-stores.ts.
export function createOutboxStore(storage: StateStorage) {
  const change = (items: OutboxItem[], clientId: string, update: (item: OutboxItem) => OutboxItem) =>
    items.map((item) => (item.clientId === clientId ? update(item) : item));

  return createStore<OutboxState>()(
    persist(
      (set) => ({
        items: [],
        enqueue: (item) =>
          set((state) =>
            state.items.some((i) => i.clientId === item.clientId)
              ? state // already queued: Finish was tapped twice, or the app died mid-finish
              : {
                  items: [
                    ...state.items,
                    { ...item, status: "pending", attempts: 0, nextAttemptAt: null, lastError: null },
                  ],
                },
          ),
        markSynced: (clientId) => set((state) => ({ items: state.items.filter((i) => i.clientId !== clientId) })),
        markRetry: (clientId, update) =>
          set((state) => ({ items: change(state.items, clientId, (i) => ({ ...i, ...update })) })),
        markNeedsAttention: (clientId, message) =>
          set((state) => ({
            items: change(state.items, clientId, (i) => ({
              ...i,
              status: "needs_attention",
              nextAttemptAt: null,
              lastError: message,
            })),
          })),
        retry: (clientId) =>
          set((state) => ({
            items: change(state.items, clientId, (i) => ({ ...i, status: "pending", attempts: 0, nextAttemptAt: null })),
          })),
        remove: (clientId) => set((state) => ({ items: state.items.filter((i) => i.clientId !== clientId) })),
      }),
      {
        name: "levelup.outbox",
        // Bump `version` (and add `migrate`) if OutboxItem's shape ever changes, so items
        // saved by an older app version are upgraded instead of breaking.
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ items: state.items }), // save data, not functions
      },
    ),
  );
}
