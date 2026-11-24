import { createRestTimerStore, type RestNotifier } from "@/stores/rest-timer-store";
import { memoryStorage } from "@/test/fixtures";
import { addRest, pauseRest, remainingText, resumeRest, startRest, viewRest } from "./rest-timer";

const T0 = 1_000_000;
const s = (seconds: number) => T0 + seconds * 1000;

describe("rest timer rules", () => {
  it("counts down from the END time, so time passing in the background still counts", () => {
    const timer = startRest(90, T0);
    // The app was in the background for 60 s: no ticks ran, but the view is still right.
    expect(viewRest(timer, s(60))).toEqual({ phase: "resting", paused: false, remainingMs: 30_000, fraction: 1 / 3 });
    expect(viewRest(timer, s(90))).toEqual({ phase: "done" });
  });

  it("adds 30 s, growing the ring when the rest gets longer than it started", () => {
    const timer = addRest(startRest(90, T0), 30, s(80)); // 10 s left -> 40 s
    expect(viewRest(timer, s(80))).toMatchObject({ remainingMs: 40_000, fraction: 40 / 90 });

    const longer = addRest(startRest(20, T0), 30, s(0)); // 50 s left, more than the 20 s it started with
    expect(viewRest(longer, s(0))).toMatchObject({ remainingMs: 50_000, fraction: 1 });
  });

  it("pauses and resumes without losing or gaining time", () => {
    const paused = pauseRest(startRest(90, T0), s(30));
    expect(viewRest(paused, s(500))).toMatchObject({ paused: true, remainingMs: 60_000 }); // frozen while paused

    expect(viewRest(resumeRest(paused, s(500)), s(510))).toMatchObject({ paused: false, remainingMs: 50_000 });
  });

  it("rounds the countdown up, so it never shows 0:00 while still resting", () => {
    expect([remainingText(90_000), remainingText(59_001), remainingText(400), remainingText(0)]).toEqual([
      "1:30",
      "1:00",
      "0:01",
      "0:00",
    ]);
  });
});

describe("rest timer store and its notification", () => {
  function setup() {
    let now = T0;
    let nextId = 0;
    const scheduled = new Map<string, { at: number; body: string }>();
    const notifier: RestNotifier = {
      schedule: async (at, body) => {
        const id = `n${++nextId}`;
        scheduled.set(id, { at: at.getTime(), body });
        return id;
      },
      cancel: async (id) => void scheduled.delete(id),
    };
    const storage = memoryStorage();
    const store = createRestTimerStore({ storage, now: () => now, notifier });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    return { store, storage, scheduled, flush, setNow: (t: number) => (now = t) };
  }

  it("schedules one notification at the end of rest, saying what's next", async () => {
    const { store, scheduled, flush } = setup();

    store.getState().start(120, "set 3 · 62.5 kg × 7");
    await flush();

    expect([...scheduled.values()]).toEqual([{ at: s(120), body: "Next: set 3 · 62.5 kg × 7" }]);
  });

  it("moves it on +30s, removes it on pause and skip, and brings it back on resume", async () => {
    const { store, scheduled, flush, setNow } = setup();
    store.getState().start(120, "set 2");
    await flush();

    setNow(s(100));
    store.getState().addTime(30);
    await flush();
    expect([...scheduled.values()].map((n) => n.at)).toEqual([s(150)]);

    store.getState().pause();
    await flush();
    expect(scheduled.size).toBe(0);

    setNow(s(200));
    store.getState().resume();
    await flush();
    expect([...scheduled.values()].map((n) => n.at)).toEqual([s(250)]); // the 50 s that were left

    store.getState().skip();
    await flush();
    expect(scheduled.size).toBe(0);
  });

  it("never leaves a stale notification when changes come faster than scheduling", async () => {
    const { store, scheduled, flush } = setup();

    store.getState().start(120, "a");
    store.getState().skip(); // before the first schedule() has resolved
    await flush();

    expect(scheduled.size).toBe(0);
  });

  it("comes back mid-rest after the app is killed", () => {
    const { store, storage } = setup();
    store.getState().start(90, "next");

    const restarted = createRestTimerStore({
      storage,
      now: () => s(30),
      notifier: { schedule: async () => null, cancel: async () => {} },
    });

    expect(viewRest(restarted.getState().timer, s(30))).toMatchObject({ phase: "resting", remainingMs: 60_000 });
  });
});
