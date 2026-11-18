import { epleyOneRepMax, JUMP_CAP, type FinishWorkoutInput } from "@levelup/shared";
import { benchPress, pullUp, testUuid } from "@/test/fixtures";
import type { OutboxItem } from "./outbox";
import { effectiveXpHistory, historyAfterWorkout, historyFromList, type ReplayContext, type XpHistory } from "./xp-history";

const context: ReplayContext = { exercises: new Map([benchPress, pullUp].map((e) => [e.id, e])), bodyweight: { xp: 80, typed: 80 } };
const empty: XpHistory = new Map();

/** A finished bench workout: `sets` x 8 reps at `kg`. */
function bench(n: number, kg: number, sets = 3): FinishWorkoutInput {
  return {
    clientId: testUuid(n),
    startedAt: `2026-11-1${n}T06:00:00.000Z`,
    finishedAt: `2026-11-1${n}T07:00:00.000Z`,
    exercises: [{ exerciseId: benchPress.id, sets: Array.from({ length: sets }, () => ({ reps: 8, weightKg: kg })) }],
  };
}

function queued(payload: FinishWorkoutInput, overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    clientId: payload.clientId,
    userId: "user-1",
    payload,
    queuedAt: payload.finishedAt,
    status: "pending",
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    ...overrides,
  };
}

describe("historyAfterWorkout", () => {
  it("starts an exercise's history from its first session (estimated 1RM of the weight lifted)", () => {
    expect(historyAfterWorkout(empty, bench(1, 100), context).get(benchPress.id)).toEqual({
      recentBest: epleyOneRepMax(100, 8),
      jumpBaseline: epleyOneRepMax(100, 8),
    });
  });

  it("holds a jump of more than 25% to the line, as the server's replay does", () => {
    const after = historyAfterWorkout(historyAfterWorkout(empty, bench(1, 60), context), bench(2, 100), context).get(benchPress.id)!;
    expect(after.jumpBaseline).toBeCloseTo(epleyOneRepMax(60, 8) * (1 + JUMP_CAP.maxJump));
    expect(after.recentBest).toBeCloseTo(epleyOneRepMax(100, 8)); // the 12-week best keeps the lift itself
  });

  it("skips exercises missing from the library", () => {
    const unknown: FinishWorkoutInput = { ...bench(1, 100), exercises: [{ exerciseId: testUuid(99), sets: [{ reps: 8, weightKg: 100 }] }] };
    expect(historyAfterWorkout(empty, unknown, context)).toBe(empty);
  });
});

describe("effectiveXpHistory: the server's copy plus the outbox", () => {
  const server = historyFromList({ items: [{ exerciseId: benchPress.id, recentBest: epleyOneRepMax(60, 8), jumpBaseline: epleyOneRepMax(60, 8) }] });

  it("builds each queued workout on the one before, in outbox order", () => {
    // Two workouts logged offline: 72 kg (within 25% of the server's 60), then 88 kg
    // (within 25% of 72, but not of 60).
    const first = bench(1, 72);
    const second = bench(2, 88);

    const history = effectiveXpHistory(server, [queued(first), queued(second)], "user-1", context);

    // The second is judged against the FIRST one's baseline, so 88 x 8 isn't capped...
    expect(history).toEqual(historyAfterWorkout(historyAfterWorkout(server, first, context), second, context));
    expect(history.get(benchPress.id)!.jumpBaseline).toBeCloseTo(epleyOneRepMax(88, 8));
    // ...whereas against the server's copy alone it would have been held to 60 x 8 + 25%.
    expect(historyAfterWorkout(server, second, context).get(benchPress.id)!.jumpBaseline).toBeCloseTo(epleyOneRepMax(60, 8) * (1 + JUMP_CAP.maxJump));
  });

  it("leaves out a workout the server rejected (needs attention): its bests were never saved", () => {
    const rejected = queued(bench(1, 80), { status: "needs_attention", lastError: "Validation failed" });
    expect(effectiveXpHistory(server, [rejected], "user-1", context)).toEqual(server);
  });

  it("only replays the signed-in player's workouts", () => {
    const someoneElse = queued(bench(1, 80), { userId: "user-2" });
    expect(effectiveXpHistory(server, [someoneElse], "user-1", context)).toEqual(server);
  });

  it("is the server's copy when nothing is queued", () => {
    expect(effectiveXpHistory(server, [], "user-1", context)).toBe(server);
  });
});
