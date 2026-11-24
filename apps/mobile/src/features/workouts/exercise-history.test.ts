import type { ExerciseSession } from "@levelup/shared";
import { benchPress, plank } from "@/test/fixtures";
import { changeText, prSets, sessionLine, trend } from "./exercise-history";

const NOW = new Date(2026, 10, 12, 12); // Thu 12 Nov 2026
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function session(
  id: string,
  ago: number,
  bestE1rm: number | null,
  sets: { reps: number; weightKg: number }[] = [],
  volumeKg = 0,
): ExerciseSession {
  return { workoutId: id, startedAt: daysAgo(ago), bodyweightKg: 80, sets, bestE1rm, volumeKg, topSet: null };
}

describe("trend", () => {
  const newestFirst = [session("a", 2, 79), session("b", 9, 76), session("c", 40, 73), session("d", 100, 70)];

  it("keeps only sessions in the range, oldest first, the latest purple when it's the best", () => {
    const month = trend(newestFirst, "1M", NOW);
    expect(month.bars.map((b) => [b.value, b.tone])).toEqual([
      [76, "past"],
      [79, "today_pr"],
    ]);
    expect(month).toMatchObject({ changeKg: 3, weeks: 1 });

    expect(trend(newestFirst, "3M", NOW).bars).toHaveLength(3);
    expect(trend(newestFirst, "1Y", NOW).bars).toHaveLength(4);
  });

  it("doesn't highlight the latest as a PR when an earlier one was higher", () => {
    expect(trend([session("a", 2, 70), session("b", 9, 76)], "1M", NOW).bars.at(-1)!.tone).toBe("today");
  });

  it("groups a long range by week, keeping each week's best, at most 12 bars", () => {
    const many = Array.from({ length: 60 }, (_, i) => session(`s${i}`, i * 3, 60 + (60 - i) / 2)); // every 3 days for 6 months
    const bars = trend(many, "1Y", NOW).bars;
    expect(bars).toHaveLength(12);
    expect(bars.at(-1)!.value).toBe(90); // the newest week's best (today's session)
  });

  it("has nothing to say about change with a single session", () => {
    expect(trend([session("a", 2, 79)], "1M", NOW)).toMatchObject({
      changeKg: null,
      bars: [{ value: 79, tone: "today" }],
    });
  });
});

describe("changeText", () => {
  it("states the change in the player's unit", () => {
    expect(changeText(9, 8, "kg")).toBe("+9 kg in 8 weeks");
    expect(changeText(-2, 1, "kg")).toBe("−2 kg in 1 week");
    expect(changeText(4.5359, 3, "lb")).toBe("+10 lb in 3 weeks");
    expect(changeText(0.1, 2, "kg")).toBe("No change in 2 weeks");
  });
});

describe("prSets", () => {
  it("marks sets that beat everything before them, with the server's rules; the first session is the baseline", () => {
    const flags = prSets(
      [
        session("today", 0, null, [
          { reps: 8, weightKg: 62.5 },
          { reps: 7, weightKg: 62.5 },
        ]), // 79.2: PR; 77.1: not
        session("last", 7, null, [{ reps: 8, weightKg: 60 }]), // 76 beats 69.7: PR
        session("first", 14, null, [{ reps: 8, weightKg: 55 }]), // 69.7: the baseline, never a PR
      ],
      benchPress,
    );
    expect(Object.fromEntries(flags)).toEqual({ first: [false], last: [true], today: [true, false] });
  });

  it("uses the longest hold for a timed exercise", () => {
    const flags = prSets(
      [session("b", 1, null, [{ reps: 75, weightKg: 0 }]), session("a", 8, null, [{ reps: 60, weightKg: 0 }])],
      plank,
    );
    expect(flags.get("b")).toEqual([true]);
  });
});

describe("sessionLine", () => {
  it("summarises volume and estimated 1RM, or the best hold", () => {
    expect(sessionLine(session("a", 1, 76.2, [], 1840), benchPress, "kg")).toBe("1,840 kg · est. 1RM 76");
    expect(
      sessionLine(
        session("b", 1, null, [
          { reps: 45, weightKg: 0 },
          { reps: 60, weightKg: 0 },
        ]),
        plank,
        "kg",
      ),
    ).toBe("Best hold 60 s");
  });
});
