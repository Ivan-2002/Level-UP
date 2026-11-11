import type { StoreApi } from "zustand/vanilla";
import type { FinishWorkoutInput } from "@levelup/shared";

// The outbox: finished workouts waiting to reach the API. Plain TypeScript, no React.
// Everything from outside (sending, clock, timers, randomness) is passed in, so the
// retry rules can be tested without a network or real time passing.

export type OutboxItem = {
  clientId: string; // the workout's clientId: the server deduplicates on it
  userId: string; // only ever sent with this user's session
  payload: FinishWorkoutInput;
  queuedAt: string; // ISO; the queue is sent oldest first
  status: "pending" | "needs_attention";
  attempts: number;
  /** When the next automatic retry is planned (ISO), for display. Null = as soon as possible. */
  nextAttemptAt: string | null;
  lastError: string | null;
};

export type OutboxState = {
  items: OutboxItem[];
  /** Adds a finished workout. Ignored if this clientId is already queued (safe to call twice). */
  enqueue: (item: Pick<OutboxItem, "clientId" | "userId" | "payload" | "queuedAt">) => void;
  markSynced: (clientId: string) => void;
  markRetry: (clientId: string, update: { attempts: number; nextAttemptAt: string; lastError: string }) => void;
  markNeedsAttention: (clientId: string, message: string) => void;
  /** The user tapped Retry on a workout that needed attention. */
  retry: (clientId: string) => void;
  remove: (clientId: string) => void;
};

export type OutboxStore = StoreApi<OutboxState>;

// --- Which failures are worth retrying -----------------------------------------

export type FailureKind = "retry" | "stop";

/**
 * - No response (offline, timeout): retry. The workout is fine; the network isn't.
 * - 5xx: retry. The server had a problem; it may be back soon.
 * - 408 Request Timeout, 429 Too Many Requests: retry. Both mean "later", not "wrong".
 * - 401: retry. An expired session isn't a bad workout; it sends after signing in again.
 * - Any other 4xx: STOP. The server rejected this workout's content (e.g. failed
 *   validation); sending the same bytes again can never succeed, so a person must look.
 * - Anything unexpected (a bug): retry, so a workout is never thrown away by mistake.
 */
export function classifyFailure(error: unknown): FailureKind {
  const status = statusOf(error);
  if (status === null) return "retry";
  if (status === 401 || status === 408 || status === 429) return "retry";
  if (status >= 400 && status < 500) return "stop";
  return "retry";
}

/** ApiError carries `status` (null = never reached the server). Read it without importing it. */
function statusOf(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

// --- How long to wait ---------------------------------------------------------------

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/**
 * Exponential backoff: 2 s, 4 s, 8 s ... capped at 5 minutes, then +/-20% random "jitter".
 * Without the jitter, every phone that went offline during a server outage would retry
 * at the same instant when it came back.
 * @param attempts failed attempts so far (1 = the first failure)
 * @param random a number in [0, 1), e.g. Math.random()
 */
export function backoffDelay(attempts: number, random: number): number {
  const exponential = Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS);
  return Math.round(exponential * (0.8 + 0.4 * random));
}

// --- The processor --------------------------------------------------------------

export type OutboxProcessorDeps = {
  store: OutboxStore;
  /** POST /workouts. Resolves on any 2xx: 201 (saved now) and 200 (already saved) both mean done. */
  send: (payload: FinishWorkoutInput) => Promise<unknown>;
  /** The signed-in user, or null. Only their items are sent. */
  getUserId: () => string | null;
  now: () => number;
  random: () => number;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** Called after each workout reaches the server (e.g. to refresh history). */
  onSynced?: (item: OutboxItem) => void;
};

export type OutboxProcessor = {
  /** Try to send everything now. Safe to call from many triggers at once. */
  flush: () => Promise<void>;
  /** Stop timers (e.g. on sign-out). */
  dispose: () => void;
};

export function createOutboxProcessor(deps: OutboxProcessorDeps): OutboxProcessor {
  let running: Promise<void> | null = null;
  let flushAgain = false;
  let timer: unknown = null;
  let disposed = false;

  function cancelTimer() {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  }

  function scheduleRetry(ms: number) {
    cancelTimer();
    if (!disposed) timer = deps.setTimer(() => void flush(), ms);
  }

  // Sends pending items one at a time, OLDEST FIRST.
  async function drain() {
    cancelTimer();
    const userId = deps.getUserId();
    if (!userId) return;

    const tried = new Set<string>();
    for (;;) {
      // Re-read the store each time: a workout finished mid-sync joins the end of the queue.
      const item = deps.store
        .getState()
        .items.find((i) => i.userId === userId && i.status === "pending" && !tried.has(i.clientId));
      if (!item || disposed) return;
      tried.add(item.clientId);

      try {
        await deps.send(item.payload);
        deps.store.getState().markSynced(item.clientId);
        deps.onSynced?.(item);
      } catch (error) {
        if (classifyFailure(error) === "stop") {
          // This workout can't succeed as it is; don't let it block the ones behind it.
          deps.store.getState().markNeedsAttention(item.clientId, messageOf(error));
          continue;
        }
        const attempts = item.attempts + 1;
        const delay = backoffDelay(attempts, deps.random());
        deps.store.getState().markRetry(item.clientId, {
          attempts,
          nextAttemptAt: new Date(deps.now() + delay).toISOString(),
          lastError: messageOf(error),
        });
        scheduleRetry(delay);
        // Keep the order: later workouts wait behind this one. (If the network is down,
        // it's down for all of them anyway.)
        return;
      }
    }
  }

  function flush(): Promise<void> {
    // One sync at a time. A trigger during a sync (app opened AND network back) asks for
    // one more pass afterwards instead of sending the same workout twice in parallel.
    if (running) {
      flushAgain = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          flushAgain = false;
          await drain();
        } while (flushAgain && !disposed);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    flush,
    dispose() {
      disposed = true;
      cancelTimer();
    },
  };
}
