import type { FinishWorkoutResponse } from "@levelup/shared";
import { memoryStorage } from "@/test/fixtures";
import { startWorkout } from "@/features/workouts/active-workout";
import { createFinishedWorkoutStore } from "./finished-workout-store";

const workout = (clientId: string) => startWorkout({ userId: "u", clientId, now: new Date("2026-11-10T06:00:00Z"), weightUnit: "kg" });
const response = { summary: { xp: { total: 99 } } } as unknown as FinishWorkoutResponse;

describe("finished workout store", () => {
  it("attaches the server's summary to the workout just finished", () => {
    const store = createFinishedWorkoutStore(memoryStorage());
    store.getState().record(workout("a"), new Date("2026-11-10T07:00:00Z"));

    store.getState().attachResponse("a", response);

    expect(store.getState().last).toMatchObject({ clientId: "a", finishedAt: "2026-11-10T07:00:00.000Z", response });
  });

  it("ignores a response for another workout (an older one syncing late)", () => {
    const store = createFinishedWorkoutStore(memoryStorage());
    store.getState().record(workout("b"), new Date());

    store.getState().attachResponse("a", response);

    expect(store.getState().last?.response).toBeNull();
  });

  it("still has the summary after the app restarts", () => {
    const storage = memoryStorage();
    createFinishedWorkoutStore(storage).getState().record(workout("a"), new Date());

    expect(createFinishedWorkoutStore(storage).getState().last?.clientId).toBe("a");
  });
});
