import { canLoadWeeklyGoal } from "./weekly-goal-gate";

describe("canLoadWeeklyGoal", () => {
  it("waits while this player has a workout waiting to sync", () => {
    expect(canLoadWeeklyGoal([{ userId: "me", status: "pending" }], "me")).toBe(false);
  });

  it("doesn't wait for workouts that need attention, or for another player's", () => {
    expect(canLoadWeeklyGoal([{ userId: "me", status: "needs_attention" }, { userId: "other", status: "pending" }], "me")).toBe(true);
    expect(canLoadWeeklyGoal([], "me")).toBe(true);
  });
});
