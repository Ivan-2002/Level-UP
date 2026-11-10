import type { FinishWorkoutInput } from "@levelup/shared";
import { createOutboxStore } from "@/stores/outbox-store";
import { memoryStorage } from "@/test/fixtures";
import { backoffDelay, classifyFailure, createOutboxProcessor, type OutboxStore } from "./outbox";

/** Mimics the app's ApiError: `status` is null when the server never answered. */
class FakeApiError extends Error {
  constructor(public readonly status: number | null, message = `HTTP ${status}`) {
    super(message);
  }
}

const NOW = Date.parse("2026-11-10T08:00:00.000Z");

function payload(clientId: string): FinishWorkoutInput {
  return {
    clientId,
    startedAt: "2026-11-10T06:00:00.000Z",
    finishedAt: "2026-11-10T07:00:00.000Z",
    exercises: [{ exerciseId: "0195f3a0-0000-7000-8000-000000000001", sets: [{ reps: 8, weightKg: 60 }] }],
  };
}

function enqueue(store: OutboxStore, clientId: string, userId = "user-1") {
  store.getState().enqueue({ clientId, userId, payload: payload(clientId), queuedAt: new Date(NOW).toISOString() });
}

/**
 * A processor whose "network" answers from a script: each call to send() takes the next
 * response for that clientId (an Error to throw, or anything else to resolve with).
 * Timers are captured instead of waiting, so tests can fire them on demand.
 */
function setup(script: Record<string, unknown[]> = {}) {
  const store = createOutboxStore(memoryStorage());
  const sent: string[] = [];
  const timers: { callback: () => void; ms: number }[] = [];
  const onSynced = jest.fn();
  const processor = createOutboxProcessor({
    store,
    send: async (body) => {
      sent.push(body.clientId);
      const next = script[body.clientId]?.shift() ?? { status: 201 };
      if (next instanceof Error) throw next;
      return next;
    },
    getUserId: () => "user-1",
    now: () => NOW,
    random: () => 0.5, // no jitter: delays are exactly 2 s, 4 s, 8 s...
    setTimer: (callback, ms) => timers.push({ callback, ms }),
    clearTimer: () => {},
    onSynced,
  });
  return { store, processor, sent, timers, onSynced, item: (id: string) => store.getState().items.find((i) => i.clientId === id) };
}

describe("classifyFailure: retry or stop", () => {
  it.each([
    ["no response (offline / timeout)", null, "retry"],
    ["500 Internal Server Error", 500, "retry"],
    ["502 Bad Gateway", 502, "retry"],
    ["503 Service Unavailable", 503, "retry"],
    ["408 Request Timeout", 408, "retry"],
    ["429 Too Many Requests", 429, "retry"],
    ["401 session expired", 401, "retry"],
    ["400 validation failed", 400, "stop"],
    ["404 not found", 404, "stop"],
    ["409 conflict", 409, "stop"],
    ["422 unprocessable", 422, "stop"],
  ])("%s -> %s", (_case, status, expected) => {
    expect(classifyFailure(new FakeApiError(status))).toBe(expected);
  });

  it("retries an unexpected error (a bug), so a workout is never thrown away", () => {
    expect(classifyFailure(new TypeError("undefined is not a function"))).toBe("retry");
  });
});

describe("backoffDelay", () => {
  it("doubles from 2 s and caps at 5 minutes", () => {
    expect([1, 2, 3, 4, 8, 9, 20].map((n) => backoffDelay(n, 0.5))).toEqual([
      2_000, 4_000, 8_000, 16_000, 256_000, 300_000, 300_000,
    ]);
  });

  it("adds up to 20% jitter either way", () => {
    expect(backoffDelay(1, 0)).toBe(1_600);
    expect(backoffDelay(1, 0.999999)).toBe(2_400);
  });
});

describe("outbox processor", () => {
  it("removes a workout once the server saves it (201)", async () => {
    const { store, processor, onSynced } = setup({ a: [{ status: 201 }] });
    enqueue(store, "a");

    await processor.flush();

    expect(store.getState().items).toEqual([]);
    expect(onSynced).toHaveBeenCalledWith(expect.objectContaining({ clientId: "a" }));
  });

  it("counts a 200 repeat (already saved on an earlier, lost response) as success", async () => {
    // e.g. the first POST saved the workout but the phone lost signal before the reply.
    const { store, processor } = setup({ a: [{ status: 200 }] });
    enqueue(store, "a");

    await processor.flush();

    expect(store.getState().items).toEqual([]);
  });

  it.each([
    ["a network error", new FakeApiError(null, "Can't reach the API")],
    ["a 503", new FakeApiError(503, "Service unavailable")],
  ])("keeps the workout and schedules a retry after %s", async (_case, error) => {
    const { store, processor, timers, item } = setup({ a: [error] });
    enqueue(store, "a");

    await processor.flush();

    expect(item("a")).toMatchObject({
      status: "pending",
      attempts: 1,
      lastError: error.message,
      nextAttemptAt: new Date(NOW + 2_000).toISOString(),
    });
    expect(timers.map((t) => t.ms)).toEqual([2_000]);
  });

  it("waits longer after each failure, and succeeds when the retry timer fires", async () => {
    const offline = () => new FakeApiError(null);
    const { store, processor, timers, sent } = setup({ a: [offline(), offline(), offline(), { status: 201 }] });
    enqueue(store, "a");

    await processor.flush();
    for (let i = 0; i < 3; i++) {
      const timer = timers.at(-1)!;
      timer.callback();
      await processor.flush(); // joins the run the timer started
    }

    expect(timers.map((t) => t.ms)).toEqual([2_000, 4_000, 8_000]);
    expect(sent).toEqual(["a", "a", "a", "a"]);
    expect(store.getState().items).toEqual([]);
  });

  it("stops on a 4xx and marks the workout as needing attention, without retrying", async () => {
    const { store, processor, timers, item } = setup({ a: [new FakeApiError(400, "A workout can last at most 6 hours.")] });
    enqueue(store, "a");

    await processor.flush();
    await processor.flush(); // another trigger (app opened) must not resend it

    expect(item("a")).toMatchObject({ status: "needs_attention", lastError: "A workout can last at most 6 hours." });
    expect(timers).toEqual([]);
  });

  it("sends a workout that needed attention again once the user taps Retry", async () => {
    const { store, processor, sent } = setup({ a: [new FakeApiError(400), { status: 201 }] });
    enqueue(store, "a");
    await processor.flush();

    store.getState().retry("a");
    await processor.flush();

    expect(sent).toEqual(["a", "a"]);
    expect(store.getState().items).toEqual([]);
  });

  describe("queue order", () => {
    it("sends oldest first", async () => {
      const { store, processor, sent } = setup();
      for (const id of ["first", "second", "third"]) enqueue(store, id);

      await processor.flush();

      expect(sent).toEqual(["first", "second", "third"]);
    });

    it("holds later workouts behind one that must be retried", async () => {
      const { store, processor, sent, item } = setup({ first: [new FakeApiError(null)] });
      for (const id of ["first", "second", "third"]) enqueue(store, id);

      await processor.flush();

      expect(sent).toEqual(["first"]);
      expect([item("second")?.attempts, item("third")?.attempts]).toEqual([0, 0]);
    });

    it("doesn't let a workout that needs attention block the ones behind it", async () => {
      const { store, processor, sent } = setup({ first: [new FakeApiError(422)] });
      for (const id of ["first", "second", "third"]) enqueue(store, id);

      await processor.flush();

      expect(sent).toEqual(["first", "second", "third"]);
      expect(store.getState().items.map((i) => [i.clientId, i.status])).toEqual([["first", "needs_attention"]]);
    });

    it("also sends a workout finished while a sync is running", async () => {
      const { store, processor, sent } = setup();
      enqueue(store, "first");

      const running = processor.flush();
      enqueue(store, "second"); // finished while "first" is in flight
      await running;

      expect(sent).toEqual(["first", "second"]);
    });
  });

  it("never sends two copies at once when triggers overlap (app opened + network back)", async () => {
    const { store, processor, sent } = setup();
    enqueue(store, "a");

    await Promise.all([processor.flush(), processor.flush(), processor.flush()]);

    expect(sent).toEqual(["a"]);
  });

  it("only sends the signed-in user's workouts", async () => {
    const { store, processor, sent } = setup();
    enqueue(store, "mine", "user-1");
    enqueue(store, "someone-elses", "user-2");

    await processor.flush();

    expect(sent).toEqual(["mine"]);
    expect(store.getState().items.map((i) => i.clientId)).toEqual(["someone-elses"]);
  });

  it("ignores a second enqueue of the same clientId (Finish tapped twice)", () => {
    const { store } = setup();
    enqueue(store, "a");
    enqueue(store, "a");

    expect(store.getState().items).toHaveLength(1);
  });

  it("keeps the queue across an app restart", () => {
    const storage = memoryStorage();
    const before = createOutboxStore(storage);
    enqueue(before, "a");

    const afterRestart = createOutboxStore(storage);

    expect(afterRestart.getState().items.map((i) => i.clientId)).toEqual(["a"]);
  });
});
