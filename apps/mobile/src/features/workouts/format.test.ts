import { formatElapsed, formatLastDone, formatRest, formatSet, plural, topSet } from "./format";

describe("formatElapsed", () => {
  it.each([
    [0, "0:00"],
    [59_999, "0:59"],
    [32 * 60_000 + 14_000, "32:14"],
    [65 * 60_000 + 9_000, "1:05:09"],
    [-5_000, "0:00"],
  ])("%i ms -> %s", (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });
});

describe("plural", () => {
  it("only adds an s when needed", () => {
    expect([plural(1, "set"), plural(0, "set"), plural(2, "set")]).toEqual(["1 set", "0 sets", "2 sets"]);
  });
});

describe("formatRest", () => {
  it.each([
    [45, "0:45"],
    [90, "1:30"],
    [600, "10:00"],
  ])("%i s -> %s", (seconds, expected) => {
    expect(formatRest(seconds)).toBe(expected);
  });
});

describe("formatLastDone", () => {
  const now = new Date(2026, 10, 12, 9, 0); // Thursday 12 Nov 2026, 09:00 local
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

  it("counts calendar days, not 24-hour periods", () => {
    expect(formatLastDone(at(2026, 10, 12, 7), now)).toBe("Today");
    expect(formatLastDone(at(2026, 10, 11, 23), now)).toBe("Yesterday"); // 10 hours ago, but yesterday
    expect(formatLastDone(at(2026, 10, 9), now)).toBe("3 days ago");
  });

  it("switches to a date after a week, adding the year only when it differs", () => {
    expect(formatLastDone(at(2026, 9, 12), now)).toBe("12 Oct");
    expect(formatLastDone(at(2025, 11, 30), now)).toBe("30 Dec 2025");
  });

  it("says when a routine was never done", () => {
    expect(formatLastDone(null, now)).toBe("Not done yet");
  });
});

describe("formatSet", () => {
  const barbell = { equipment: "barbell", repsUnit: "reps" } as const;
  const bodyweight = { equipment: "bodyweight", repsUnit: "reps" } as const;
  const timed = { equipment: "bodyweight", repsUnit: "seconds" } as const;

  it("shows weight and reps in the player's unit", () => {
    expect(formatSet({ reps: 8, weightKg: 62.5 }, barbell, "kg")).toBe("62.5 kg × 8");
    expect(formatSet({ reps: 5, weightKg: 61.235 }, barbell, "lb")).toBe("135 lb × 5");
  });

  it("shows bodyweight sets as BW, plus any added weight", () => {
    expect(formatSet({ reps: 9, weightKg: 0 }, bodyweight, "kg")).toBe("BW × 9");
    expect(formatSet({ reps: 8, weightKg: 10 }, bodyweight, "kg")).toBe("BW + 10 kg × 8");
  });

  it("shows timed sets in seconds", () => {
    expect(formatSet({ reps: 60, weightKg: 0 }, timed, "kg")).toBe("BW × 60 s");
    expect(formatSet({ reps: 45, weightKg: 0 }, { equipment: "machine", repsUnit: "seconds" }, "kg")).toBe("45 s");
  });
});

describe("topSet", () => {
  it("picks the heaviest, then the most reps", () => {
    expect(topSet([{ reps: 10, weightKg: 60 }, { reps: 6, weightKg: 70 }, { reps: 8, weightKg: 70 }])).toEqual({ reps: 8, weightKg: 70 });
    expect(topSet([])).toBeNull();
  });
});
