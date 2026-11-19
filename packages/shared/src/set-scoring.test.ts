import { describe, expect, it } from "vitest";
import {
  epleyOneRepMax,
  exerciseXpHistory,
  isBaselineSession,
  MAX_WARM_UPS_PER_EXERCISE,
  MAX_XP_SETS_PER_EXERCISE,
  recentBest,
  scoreSessionSets,
  setTagText,
  JUMP_CAP_TEXT,
  setXp,
  qualifiesAsTrainingDay,
  type ExerciseXpHistory,
  type PastExerciseSession,
  type ScoringExercise,
  type SessionSet,
} from "./index.js";

const squat: ScoringExercise = { equipment: "barbell", mechanic: "compound", repsUnit: "reps", loadFactor: 1, bodyweightRatio: 0 };
const bench: ScoringExercise = { equipment: "barbell", mechanic: "compound", repsUnit: "reps", loadFactor: 1.25, bodyweightRatio: 0 };
const plank: ScoringExercise = { equipment: "bodyweight", mechanic: "isolation", repsUnit: "seconds", loadFactor: 0.35, bodyweightRatio: 0.5 };
const exercises = new Map([
  ["squat", squat],
  ["bench", bench],
  ["plank", plank],
]);

/** A player whose best back squat is 100 kg x 8, this month. */
const squatHistory: ExerciseXpHistory = { recentBest: epleyOneRepMax(100, 8), jumpBaseline: epleyOneRepMax(100, 8) };

const set = (exerciseId: string, reps: number, weightKg: number): SessionSet => ({ exerciseId, reps, weightKg });
const times = (n: number, s: SessionSet) => Array.from({ length: n }, () => s);
const score = (sets: SessionSet[], history = new Map([["squat", squatHistory]])) =>
  scoreSessionSets({ sets, exercises, history, bodyweight: { xp: 75, typed: 75 } });

const warmUps = [set("squat", 5, 20), set("squat", 5, 40), set("squat", 3, 60), set("squat", 2, 70), set("squat", 1, 80)];

describe("scoreSessionSets", () => {
  it("earns XP for all 6 working sets after 5 warm-ups (warm-ups don't count toward the 10)", () => {
    const { sets } = score([...warmUps, ...times(6, set("squat", 8, 100))]);

    expect(sets.slice(0, 5).map((s) => s.tag)).toEqual(Array(5).fill("warm_up"));
    // 1, 3, 5, 5 and 4 XP: each under 10% of a working set's 92.
    expect(sets.slice(0, 5).map((s) => s.xp)).toEqual([1, 3, 5, 5, 4]);
    expect(sets.slice(5).map((s) => [s.xp, s.tag])).toEqual(Array(6).fill([92, null]));
  });

  it("gives the 11th non-warm-up set 0 XP with the 'Beyond 10 sets' tag", () => {
    const { sets } = score([...warmUps, ...times(11, set("squat", 8, 100))]);
    const working = sets.slice(5);

    expect(working.slice(0, 10).every((s) => s.xp === 92)).toBe(true);
    expect(working[10]).toMatchObject({ xp: 0, tag: "beyond_set_limit", isFlagged: false });
    expect(setTagText("beyond_set_limit")).toBe("Beyond 10 sets");
  });

  it("explains the jump-capped tag with a fixed sentence (no baseline number)", () => {
    expect(setTagText("above_history")).toBe("Above your best · +25%");
    expect(JUMP_CAP_TEXT).toBe("More than 25% above your best, so it earned XP as if at that limit.");
  });

  it("shares one count when the same exercise appears twice in a session (a superset)", () => {
    const block = [...times(3, set("squat", 8, 100)), ...times(3, set("bench", 8, 80))];
    const { sets } = score([...block, ...block, ...block, ...block]); // 12 squat sets, 12 bench sets
    const squatSets = sets.filter((_, i) => i % 6 < 3);

    expect(squatSets.filter((s) => s.tag === "beyond_set_limit")).toHaveLength(12 - MAX_XP_SETS_PER_EXERCISE);
    expect(squatSets.slice(10).every((s) => s.xp === 0)).toBe(true);
  });

  it("counts easy sets toward the 10 (only warm-ups before the heaviest set are free)", () => {
    const { sets } = score([set("squat", 8, 100), ...times(10, set("squat", 10, 50))]);

    expect(sets.slice(1, 10).map((s) => s.tag)).toEqual(Array(9).fill("easy_set"));
    expect(sets[10]).toMatchObject({ xp: 0, tag: "beyond_set_limit" });
  });

  it("flags an implausible set (0 XP, not counted toward the 10) and scores the rest", () => {
    const { sets } = score([set("squat", 8, 400), set("squat", 8, 100)]);

    expect(sets[0]).toMatchObject({ xp: 0, tag: "check_set", flagReason: "weight_above_range", isFlagged: true });
    expect(sets[1]).toMatchObject({ xp: 92, tag: null });
  });

  it("caps a set far above the player's best at the 25% line", () => {
    const { sets } = score([set("squat", 8, 140)]); // 177 kg estimated vs a best of 126.7

    expect(sets[0]).toMatchObject({ tag: "above_history", flagReason: "above_history", isFlagged: false });
    expect(sets[0]!.xp).toBe(Math.round(setXp({ reps: 8, weightKg: 140 }, 75, squat) * ((126.67 * 1.25) / 177.33)));
  });

  it("measures effort against this session's best when there's no recent history (first session, or back after a break)", () => {
    const { sets } = score([set("squat", 8, 100), set("squat", 8, 100)], new Map());
    expect(sets.map((s) => s.effort)).toEqual([1, 1]);
  });

  it("lets a new account farm at most 10 singles of one exercise", () => {
    const { sets } = score(times(60, set("squat", 1, 60)), new Map());

    expect(sets.filter((s) => s.xp > 0)).toHaveLength(10);
    expect(sets.reduce((sum, s) => sum + s.xp, 0)).toBe(10 * 44);
  });

  it("counts a timed set to 120 seconds and tags a longer hold", () => {
    const { sets } = score([set("plank", 60, 0), set("plank", 300, 0)]);
    expect(sets.map((s) => [s.xp, s.tag])).toEqual([
      [79, null],
      [158, "timed_limit"],
    ]);
  });

  describe("with a 12-week best: looks back only (a set's score never depends on a later set)", () => {
    // Every prefix of the session scores its sets exactly as the whole session does: in the
    // live view, a row's XP and tag are final once it's ticked.
    const expectPrefixStable = (sets: SessionSet[], history?: Map<string, ExerciseXpHistory>) => {
      const whole = score(sets, history).sets;
      for (let k = 1; k <= sets.length; k++) expect(score(sets.slice(0, k), history).sets).toEqual(whole.slice(0, k));
    };
    const ramp = [set("squat", 5, 40), set("squat", 5, 60), set("squat", 5, 80)];

    it("tags a three-set warm-up ramp as warm-ups, and never re-scores it when the working sets follow", () => {
      const { sets } = score([...ramp, ...times(3, set("squat", 8, 100))]);

      expect(sets.slice(0, 3).map((s) => s.tag)).toEqual(["warm_up", "warm_up", "warm_up"]);
      expectPrefixStable([...ramp, ...times(3, set("squat", 8, 100))]);
      expectPrefixStable([...warmUps, ...times(11, set("squat", 8, 100))]);
    });

    it("doesn't re-score earlier sets on a day you beat your best", () => {
      // The best is 100 x 8; 105 x 8 beats it (and stays under the jump cap).
      expectPrefixStable([...ramp, set("squat", 8, 100), set("squat", 8, 105)]);
    });

    it("allows at most 5 warm-ups: later light sets are easy sets and count toward the 10", () => {
      const { sets } = score(times(20, set("squat", 5, 60)));

      expect(sets.slice(0, MAX_WARM_UPS_PER_EXERCISE).every((s) => s.tag === "warm_up")).toBe(true);
      expect(sets.slice(5, 15).every((s) => s.tag === "easy_set" && s.xp > 0)).toBe(true);
      expect(sets.slice(15).every((s) => s.tag === "beyond_set_limit" && s.xp === 0)).toBe(true);
      expectPrefixStable(times(20, set("squat", 5, 60)));
    });

    it("calls a light set after a working set an easy set, even before a heavier one", () => {
      const { sets } = score([set("squat", 8, 100), set("squat", 5, 40), set("squat", 5, 105)]);
      expect(sets.map((s) => s.tag)).toEqual([null, "easy_set", null]);
    });
  });

  describe("a baseline session (no 12-week best): earlier sets are re-scored as heavier ones follow", () => {
    it("knows a baseline session by the missing 12-week best", () => {
      expect(isBaselineSession(null)).toBe(true);
      expect(isBaselineSession(squatHistory.recentBest)).toBe(false);
    });

    it("turns 60 x 5 into a warm-up once 100 x 5 follows it", () => {
      const sixties = times(3, set("squat", 5, 60));
      const before = score(sixties, new Map()).sets;
      const after = score([...sixties, set("squat", 5, 100)], new Map()).sets;

      expect(before.map((s) => [s.xp, s.tag])).toEqual(Array(3).fill([51, null]));
      expect(after.map((s) => [s.xp, s.tag])).toEqual([[10, "warm_up"], [10, "warm_up"], [10, "warm_up"], [85, null]]);
    });

    it("allows at most 5 warm-ups there too, however many light sets come before the heaviest", () => {
      const { sets } = score([...times(20, set("squat", 1, 60)), set("squat", 5, 100)], new Map());
      expect(sets.filter((s) => s.tag === "warm_up")).toHaveLength(MAX_WARM_UPS_PER_EXERCISE);
      expect(sets.filter((s) => s.xp > 0)).toHaveLength(MAX_WARM_UPS_PER_EXERCISE + MAX_XP_SETS_PER_EXERCISE);
    });

    it("re-scores a three-set warm-up ramp as warm-ups once the heavy set follows", () => {
      const ramp = [set("squat", 5, 40), set("squat", 5, 60), set("squat", 5, 80)];
      const before = score(ramp, new Map()).sets;
      const after = score([...ramp, set("squat", 5, 100)], new Map()).sets;

      // Alone, the 80 is the best so far: a working set. Once 100 x 5 follows, all three are warm-ups.
      expect(before.map((s) => s.tag)).toEqual(["warm_up", "warm_up", null]);
      expect(after.slice(0, 3).map((s) => s.tag)).toEqual(["warm_up", "warm_up", "warm_up"]);
      expect(after.slice(0, 3).reduce((sum, s) => sum + s.xp, 0)).toBeLessThan(before.reduce((sum, s) => sum + s.xp, 0));
      expect(after[3]).toMatchObject({ xp: 85, tag: null });
    });
  });

  describe("order: completedAt when every set has one, else as given", () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 18, 10, minute)).toISOString();

    it("scores a heavier set higher in the list, ticked later, after the sets ticked before it", () => {
      // Against history (best 100 x 8): listed heavy first, but the 60s were ticked first,
      // so they're warm-ups (before any working set), not easy sets.
      const heavyListedFirst = [
        { ...set("squat", 8, 100), completedAt: at(9) },
        { ...set("squat", 5, 60), completedAt: at(1) },
        { ...set("squat", 5, 60), completedAt: at(4) },
      ];
      expect(score(heavyListedFirst).sets.map((s) => s.tag)).toEqual([null, "warm_up", "warm_up"]);

      // One time missing: the order given, so the 60s follow a working set: easy sets.
      const oneMissing = [heavyListedFirst[0]!, heavyListedFirst[1]!, { ...heavyListedFirst[2]!, completedAt: null }];
      expect(score(oneMissing).sets.map((s) => s.tag)).toEqual([null, "easy_set", "easy_set"]);
    });

    it("keeps the order given for sets ticked at the same moment", () => {
      const sets = [{ ...set("squat", 8, 100), completedAt: at(0) }, { ...set("squat", 5, 60), completedAt: at(0) }];
      expect(score(sets).sets.map((s) => s.tag)).toEqual([null, "easy_set"]);
    });

    it("finds a baseline session's heaviest set in completedAt order", () => {
      // No history. Listed 100 first, ticked last: the 60s come before the heaviest, so warm-ups.
      const sets = [{ ...set("squat", 5, 100), completedAt: at(9) }, { ...set("squat", 5, 60), completedAt: at(1) }];
      expect(score(sets, new Map()).sets.map((s) => s.tag)).toEqual([null, "warm_up"]);
    });
  });

  describe("a jump-capped set (a mistype) is never a reference for effort", () => {
    // History: best 100 x 8. 200 x 8 is far above the +25% line: a typo for 100.
    it("doesn't raise the reference for the sets after it in the session", () => {
      const { sets } = score([set("squat", 8, 100), set("squat", 8, 200), set("squat", 8, 100)]);
      expect(sets.map((s) => s.tag)).toEqual([null, "above_history", null]);
      expect(sets[2]).toMatchObject({ xp: 92, effort: 1 });
    });

    it("isn't the heaviest set of a baseline session after a break (no warm-ups before it)", () => {
      // 12+ weeks off: no 12-week best, but the jump baseline remembers 100 x 8.
      const comeback = new Map([["squat", { recentBest: null, jumpBaseline: epleyOneRepMax(100, 8) }]]);
      const { sets } = score([set("squat", 8, 100), set("squat", 8, 200), set("squat", 8, 100)], comeback);
      expect(sets.map((s) => s.tag)).toEqual([null, "above_history", null]);
      expect([sets[0]!.xp, sets[2]!.xp]).toEqual([92, 92]);
    });

    it("is left out of the session's best for the next session, but counts at the line for the jump baseline", () => {
      const { exercises: after } = score([set("squat", 8, 100), set("squat", 8, 200)]);
      expect(after.get("squat")).toEqual({ jumpBaselineAfter: epleyOneRepMax(100, 8) * 1.25, sessionBest: epleyOneRepMax(100, 8) });

      const onlyCapped = score([set("squat", 8, 200)]).exercises.get("squat")!;
      expect(onlyCapped.sessionBest).toBeNull();
    });

    it("doesn't change the next honest session's effort, tags or training day", () => {
      // 50 kg dumbbells x 10, then a session with 80 typed for 50 on its last set.
      const honest = { reps: 10, weightKg: 50 };
      const week1: PastExerciseSession = { date: "2026-11-03", bodyweightKg: 75, sets: [honest, honest, honest] };
      const typo: PastExerciseSession = { date: "2026-11-10", bodyweightKg: 75, sets: [honest, honest, { reps: 10, weightKg: 80 }] };
      const clean: PastExerciseSession = { ...typo, sets: [honest, honest, honest] };
      const next = times(3, set("squat", 10, 50));
      const after = (sessions: PastExerciseSession[]) => score(next, new Map([["squat", exerciseXpHistory(sessions, squat, "2026-11-17")]])).sets;

      // The typo really was jump-capped (so it's this rule that protects the next session).
      const typoScored = score(typo.sets.map((x) => set("squat", x.reps, x.weightKg)), new Map([["squat", exerciseXpHistory([week1], squat, "2026-11-10")]]));
      expect(typoScored.sets[2]!.tag).toBe("above_history");

      const withTypo = after([week1, typo]);
      expect(withTypo).toEqual(after([week1, clean]));
      expect(withTypo.map((s) => [s.effort, s.tag])).toEqual([[1, null], [1, null], [1, null]]);
      expect(qualifiesAsTrainingDay({ sets: withTypo.map((s) => ({ isFlagged: s.isFlagged, tag: s.tag })) })).toBe(true);
    });
  });

  it("reports each exercise's baseline and best for the next session", () => {
    const { exercises: after } = score([set("squat", 8, 100), set("squat", 5, 110)]);
    expect(after.get("squat")).toEqual({ jumpBaselineAfter: epleyOneRepMax(110, 5), sessionBest: epleyOneRepMax(110, 5) });
  });
});

describe("recentBest: the 12-week window for effort", () => {
  it("includes sessions from the last 84 days and ignores older ones", () => {
    const sessions = [
      { date: "2026-08-24", value: 140 }, // 85 days before 17 Nov: outside
      { date: "2026-08-25", value: 120 }, // 84 days: inside
      { date: "2026-11-10", value: 110 },
    ];
    expect(recentBest(sessions, "2026-11-17")).toBe(120);
    expect(recentBest([{ date: "2026-01-01", value: 140 }], "2026-11-17")).toBeNull();
  });
});

describe("exerciseXpHistory: history rebuilt from stored sessions", () => {
  // Three squat sessions, the last one far above the others (so its sets are jump-capped).
  const sessions: PastExerciseSession[] = [
    { date: "2026-08-01", bodyweightKg: 75, sets: [{ reps: 8, weightKg: 60 }] },
    { date: "2026-10-01", bodyweightKg: 75, sets: [{ reps: 8, weightKg: 70 }, { reps: 5, weightKg: 80 }] },
    { date: "2026-11-10", bodyweightKg: 75, sets: [{ reps: 8, weightKg: 150 }] },
  ];

  it("matches what scoring one session after another carries forward", () => {
    // What the simulation does: score each session with the history so far, keep the result.
    let carried: ExerciseXpHistory = { recentBest: null, jumpBaseline: null };
    const bests: { date: string; value: number }[] = [];
    for (const s of sessions) {
      const sets = s.sets.map((x) => set("squat", x.reps, x.weightKg));
      const after = score(sets, new Map([["squat", carried]])).exercises.get("squat")!;
      if (after.sessionBest !== null) bests.push({ date: s.date, value: after.sessionBest });
      carried = { recentBest: recentBest(bests, "2026-11-17"), jumpBaseline: after.jumpBaselineAfter };
    }

    expect(exerciseXpHistory(sessions, squat, "2026-11-17")).toEqual(carried);
  });

  it("keeps a jump-capped session at the line for the jump baseline, and out of the 12-week best", () => {
    const history = exerciseXpHistory(sessions, squat, "2026-11-17");
    const before = Math.max(epleyOneRepMax(70, 8), epleyOneRepMax(80, 5));
    expect(history.jumpBaseline).toBeCloseTo(before * 1.25);
    // Not 150 x 8: the 12-week best is October's (August's 60 x 8 is outside the window).
    expect(history.recentBest).toBeCloseTo(before);
  });

  it("counts the bodyweight share of bodyweight exercises, and seconds for timed ones", () => {
    const pullUp = { bodyweightRatio: 1, repsUnit: "reps" as const };
    const at80 = exerciseXpHistory([{ date: "2026-11-10", bodyweightKg: 80, sets: [{ reps: 10, weightKg: 0 }] }], pullUp, "2026-11-17");
    expect(at80.jumpBaseline).toBeCloseTo(epleyOneRepMax(80, 10));

    const hold = exerciseXpHistory([{ date: "2026-11-10", bodyweightKg: 80, sets: [{ reps: 90, weightKg: 0 }] }], plank, "2026-11-17");
    expect(hold).toEqual({ recentBest: 90, jumpBaseline: 90 });
  });

  it("is empty with no sessions", () => {
    expect(exerciseXpHistory([], squat, "2026-11-17")).toEqual({ recentBest: null, jumpBaseline: null });
  });
});
