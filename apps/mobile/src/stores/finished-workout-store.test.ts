import type { FinishWorkoutResponse } from "@levelup/shared";
import { memoryStorage } from "@/test/fixtures";
import { startWorkout } from "@/features/workouts/active-workout";
import { createFinishedWorkoutStore } from "./finished-workout-store";

const workout = (clientId: string) =>
  startWorkout({ userId: "u", clientId, now: new Date("2026-11-10T06:00:00Z"), weightUnit: "kg" });
const response = { summary: { xp: { total: 99 } } } as unknown as FinishWorkoutResponse;
const finished = (clientId: string, finishedAt = "2026-11-10T07:00:00.000Z") => ({
  workout: workout(clientId),
  finishedAt,
  preview: { setXp: 120, heldBack: 0, sets: [{ xp: 120, tag: null, isFlagged: false }] },
  levelBefore: { level: 2, xpIntoLevel: 100, xpForNextLevel: 900 },
});

describe("finished workout store", () => {
  it("attaches the server's summary to the workout just finished", () => {
    const store = createFinishedWorkoutStore(memoryStorage());
    store.getState().record(finished("a"));

    store.getState().attachResponse("a", response);

    expect(store.getState().last).toMatchObject({
      clientId: "a",
      finishedAt: "2026-11-10T07:00:00.000Z",
      preview: { setXp: 120 },
      response,
    });
  });

  it("keeps the first response when a repeated Finish answers again", () => {
    const store = createFinishedWorkoutStore(memoryStorage());
    store.getState().record(finished("a"));
    store.getState().attachResponse("a", response);

    // E.g. PRs moved because an earlier-started workout synced in between.
    const later = { summary: { xp: { total: 99 }, prs: [] } } as unknown as FinishWorkoutResponse;
    store.getState().attachResponse("a", later);

    expect(store.getState().last?.response).toBe(response);
  });

  it("ignores a response for another workout (an older one syncing late)", () => {
    const store = createFinishedWorkoutStore(memoryStorage());
    store.getState().record(finished("b"));

    store.getState().attachResponse("a", response);

    expect(store.getState().last?.response).toBeNull();
  });

  it("still has the summary after the app restarts", () => {
    const storage = memoryStorage();
    createFinishedWorkoutStore(storage).getState().record(finished("a"));

    // The preview and the cached level come back too: the labelled estimate is the same after a restart.
    expect(createFinishedWorkoutStore(storage).getState().last).toMatchObject({
      clientId: "a",
      preview: finished("a").preview,
      levelBefore: finished("a").levelBefore,
    });
  });

  it("upgrades a summary saved by store v1 with no estimate, not the old plain-set-XP one", async () => {
    const storage = memoryStorage();
    const v1 = {
      clientId: "a",
      userId: "u",
      workout: workout("a"),
      finishedAt: "2026-11-10T07:00:00.000Z",
      response: null,
    };
    await storage.setItem("levelup.finished-workout", JSON.stringify({ state: { last: v1 }, version: 1 }));

    expect(createFinishedWorkoutStore(storage).getState().last).toEqual({ ...v1, preview: null, levelBefore: null });
  });
});
