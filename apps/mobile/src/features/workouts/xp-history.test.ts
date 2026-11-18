import { applyDailyCap, epleyOneRepMax, exerciseXpHistoryListSchema, JUMP_CAP, type FinishWorkoutInput } from "@levelup/shared";
import { readCached, writeCached } from "@/lib/device-cache";
import { benchPress, pullUp, testUuid } from "@/test/fixtures";
import type { OutboxItem } from "./outbox";
import { dayXpBefore, effectiveXpHistory, historyAfterWorkout, historyFromList, replayOutbox, xpHistoryCacheKey, type ReplayContext, type XpHistory } from "./xp-history";

// expo-sqlite's kv-store is native: stand in an in-memory map with the same sync API.
jest.mock("expo-sqlite/kv-store", () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItemSync: (key: string) => data.get(key) ?? null,
      setItemSync: (key: string, value: string) => void data.set(key, value),
      removeItemSync: (key: string) => void data.delete(key),
    },
  };
});

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

describe("lost responses: a workout the server already counted isn't counted twice", () => {
  const server: XpHistory = new Map();

  it("skips a queued workout whose clientId the server's copy lists, in the history and the day", () => {
    const lost = queued(bench(3, 100)); // reached the server; the response was lost, so it's still queued
    const replayed = replayOutbox(server, [lost], "user-1", context, new Set([lost.clientId]));

    expect(replayed.history).toBe(server); // the server's copy already has its bests
    expect(replayed.workouts).toEqual([]); // and its XP is in today.setXp
  });

  it("still counts a queued workout the server hasn't seen", () => {
    const replayed = replayOutbox(server, [queued(bench(3, 100))], "user-1", context, new Set([testUuid(9)]));
    expect(replayed.workouts).toHaveLength(1);
    expect(replayed.workouts[0]!.setXp.every((xp) => xp > 0)).toBe(true);
  });
});

describe("dayXpBefore: the daily cap's starting point", () => {
  const cap = { limit: 3100, bandRate: 0.25, ceilingMultiple: 2 };
  // Auckland is UTC+13 in November: 10:30 UTC on the 17th is 23:30 on the 17th there, 11:30 UTC is 00:30 on the 18th.
  const TZ = "Pacific/Auckland";
  const workoutAt = (startedAt: string, setXp: number[]) => ({ clientId: testUuid(5), startedAt, setXp });

  it("starts from the server's count when its copy is for the workout's day", () => {
    const today = { date: "2026-11-18", setXp: 1200, clientIds: [] };
    expect(dayXpBefore({ day: "2026-11-18", timeZone: TZ, today, cap, queued: [] })).toBe(1200);
  });

  it("ignores a server copy from another day (it says nothing about today)", () => {
    const yesterday = { date: "2026-11-17", setXp: 2500, clientIds: [] };
    expect(dayXpBefore({ day: "2026-11-18", timeZone: TZ, today: yesterday, cap, queued: [] })).toBe(0);
  });

  it("adds queued workouts that STARTED that local day in the profile's zone, not the UTC day", () => {
    const queuedXp = [
      workoutAt("2026-11-17T11:30:00.000Z", [500, 500]), // 00:30 on the 18th in Auckland: counts
      workoutAt("2026-11-17T10:30:00.000Z", [700]), // 23:30 on the 17th in Auckland: same UTC day, doesn't count
    ];
    const today = { date: "2026-11-18", setXp: 1200, clientIds: [] };
    expect(dayXpBefore({ day: "2026-11-18", timeZone: TZ, today, cap, queued: queuedXp })).toBe(2200);
  });

  it("caps each queued workout in turn, as the server will when they're sent", () => {
    const big = workoutAt("2026-11-17T11:30:00.000Z", [1500, 1500]);
    const today = { date: "2026-11-18", setXp: 2000, clientIds: [] };
    const awarded = applyDailyCap(2000, [1500, 1500], cap).awarded.reduce((a, b) => a + b, 0);
    expect(dayXpBefore({ day: "2026-11-18", timeZone: TZ, today, cap, queued: [big] })).toBe(2000 + awarded);
    expect(awarded).toBeLessThan(3000);
  });
});

describe("the saved copy from before the daily cap fields", () => {
  it("is still read, with its history and no cap data, so offline exercises aren't all baseline sessions", () => {
    const old = { items: [{ exerciseId: benchPress.id, recentBest: epleyOneRepMax(100, 8), jumpBaseline: epleyOneRepMax(100, 8) }] };
    writeCached(xpHistoryCacheKey("user-1"), old);

    // The read the query does on open (initialData), with the app's key and schema.
    const cached = readCached(xpHistoryCacheKey("user-1"), exerciseXpHistoryListSchema)!;
    expect(cached).toEqual({ ...old, dailyCap: null, today: null });
    expect(historyFromList(cached).get(benchPress.id)?.recentBest).toBe(epleyOneRepMax(100, 8));
  });
});
