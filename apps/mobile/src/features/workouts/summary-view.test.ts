import { JUMP_CAP_TEXT } from "@levelup/shared";
import { benchPress, plank, pullUp, sequentialIds } from "@/test/fixtures";
import { addExercise, startWorkout, toggleSetDone, updateSet } from "./active-workout";
import {
  compareCount,
  compareDuration,
  compareVolume,
  exerciseXpRows,
  explainGap,
  heldBackText,
  levelBar,
  pendingLevelBar,
  prHeading,
  prLine,
  previewSummary,
  volumeText,
  xpLines,
} from "./summary-view";

describe("comparisons with last time", () => {
  it("says how much faster or longer, within a minute counting as the same", () => {
    expect(compareDuration(58 * 60 + 40, 61 * 60 + 40)).toEqual({ text: "3 min faster", better: false });
    expect(compareDuration(3600, 3550)).toEqual({ text: "Same as last", better: false });
    expect(compareDuration(3600, null)).toBeNull();
  });

  it("counts sets", () => {
    expect([compareCount(18, 16), compareCount(15, 16), compareCount(18, 18)].map((c) => c?.text)).toEqual([
      "+2 vs last",
      "−1 vs last",
      "Same as last",
    ]);
  });

  it("gives volume as a percentage, green when it went up", () => {
    expect(compareVolume(7420, 7135)).toEqual({ text: "+4% vs last", better: true });
    expect(compareVolume(7000, 7420)).toEqual({ text: "−6% vs last", better: false });
    expect(compareVolume(100, 0)).toBeNull();
  });

  it("shows volume in the player's unit", () => {
    expect([volumeText(7420, "kg"), volumeText(1000, "lb")]).toEqual(["7,420", "2,205"]);
  });
});

describe("levelBar (from the server's level status before and after)", () => {
  it("splits the bar into XP you had (purple) and XP this workout added (ice)", () => {
    const bar = levelBar(
      { level: 5, xpIntoLevel: 100, xpForNextLevel: 4000 },
      { level: 5, xpIntoLevel: 300, xpForNextLevel: 4000 },
    );

    expect(bar).toMatchObject({
      level: 5,
      levelsGained: 0,
      levelText: "Level 5",
      levelUpText: null,
      progressText: "300 / 4,000 XP",
      toNextText: "3,700 XP to level 6",
    });
    expect(bar.before).toBeCloseTo(100 / 4000);
    expect(bar.gained).toBeCloseTo(200 / 4000);
  });

  it("counts everything in a new level as this workout's gain", () => {
    const bar = levelBar(
      { level: 1, xpIntoLevel: 390, xpForNextLevel: 400 },
      { level: 2, xpIntoLevel: 40, xpForNextLevel: 2200 },
    );
    expect(bar).toMatchObject({
      level: 2,
      levelsGained: 1,
      levelText: "Level 2",
      levelUpText: "Level up! You reached level 2.",
      before: 0,
    });
    expect(bar.gained).toBeCloseTo(40 / 2200);
  });

  it("shows only the new level's progress when more than one level was gained (Level 4 → 6)", () => {
    // Level 4 nearly full, then a big workout plus a streak bonus: through level 5 into 6.
    const bar = levelBar(
      { level: 4, xpIntoLevel: 3500, xpForNextLevel: 3600 },
      { level: 6, xpIntoLevel: 900, xpForNextLevel: 6000 },
    );

    expect(bar).toMatchObject({
      level: 6,
      levelsGained: 2,
      levelText: "Level 4 → 6",
      levelUpText: "Level up! You went from level 4 to 6.",
    });
    // Nothing of level 4 (or 5) is drawn: the bar is level 6's, and all of it is this workout's.
    expect(bar.before).toBe(0);
    expect(bar.gained).toBeCloseTo(900 / 6000);
    expect(bar).toMatchObject({ progressText: "900 / 6,000 XP", toNextText: "5,100 XP to level 7" });
  });
});

describe("xpLines and heldBackText", () => {
  const xp = { sets: 1240, weeklyGoal: 0, streakMilestone: 0, total: 1240, heldBack: null };

  it("leads with the total, and breaks it down starting with set XP, labelled as the estimate is", () => {
    expect(xpLines({ xp, weeklyGoal: null })).toEqual({
      headline: { label: "Total XP earned", amount: 1240 },
      breakdown: [{ label: "XP for sets", amount: 1240 }],
    });
  });

  it("puts each bonus on its own line of the breakdown", () => {
    const lines = xpLines({
      xp: { ...xp, weeklyGoal: 400, streakMilestone: 3000, total: 4640 },
      weeklyGoal: { streak: 12 } as never,
    });
    expect(lines).toEqual({
      headline: { label: "Total XP earned", amount: 4640 },
      breakdown: [
        { label: "XP for sets", amount: 1240 },
        { label: "Weekly goal met", amount: 400 },
        { label: "12-week streak bonus", amount: 3000 },
      ],
    });
  });

  it("says why set XP was held back", () => {
    expect(heldBackText(null)).toBeNull();
    expect(heldBackText({ amount: 1200, reason: "daily_cap" })).toBe("1,200 XP held back: daily limit reached.");
    expect(heldBackText({ amount: 500, reason: "too_old" })).toBe(
      "No XP for sets: it synced more than 14 days after it started.",
    );
  });
});

describe("exerciseXpRows", () => {
  const exercise = (id: string, name: string, setIds: string[]) =>
    ({ id, exercise: { name } as never, sets: setIds.map((sid) => ({ id: sid }) as never) }) as never;

  it("sums each exercise's XP and lists only its tagged sets, numbered within the exercise", () => {
    const rows = exerciseXpRows(
      { exercises: [exercise("e1", "Bench Press", ["a", "b", "c"]), exercise("e2", "Back Squat", ["d"])] },
      [
        { setId: "a", xp: 5, tag: "warm_up", flagReason: null },
        { setId: "b", xp: 90, tag: null, flagReason: null },
        { setId: "c", xp: 0, tag: "check_set", flagReason: "weight_above_range" },
        { setId: "d", xp: 70, tag: "above_history", flagReason: "above_history" },
      ],
    );

    expect(rows).toEqual([
      {
        key: "e1",
        name: "Bench Press",
        xp: 95,
        tagged: [
          { text: "Set 1 · Warm-up · +5 XP", tone: "inkMuted" },
          { text: "Set 3 · Check this set · 0 XP", tone: "danger" },
        ],
      },
      {
        key: "e2",
        name: "Back Squat",
        xp: 70,
        tagged: [{ text: "Set 1 · Above your best · +25% · +70 XP", tone: "inkMuted", detail: JUMP_CAP_TEXT }],
      },
    ]);
  });
});

describe("PR lines", () => {
  const set = { reps: 6, weightKg: 65 };

  it("describes an estimated 1RM PR with the set that set it, in the player's unit", () => {
    expect(
      prLine(
        { exerciseId: benchPress.id, exerciseName: "Bench Press", kind: "e1rm", value: 78, previousValue: 76, set },
        benchPress,
        "kg",
      ),
    ).toEqual({
      detail: "65 kg × 6 · est. 1RM",
      value: "78 kg",
      was: "was 76",
    });
  });

  it("describes reps at a weight and a longest hold", () => {
    expect(
      prLine(
        {
          exerciseId: pullUp.id,
          exerciseName: "Pull-up",
          kind: "reps_at_weight",
          value: 14,
          previousValue: 12,
          set: { reps: 14, weightKg: 0 },
        },
        pullUp,
        "kg",
      ),
    ).toEqual({
      detail: "Most reps at BW",
      value: "14 reps",
      was: "was 12",
    });
    expect(
      prLine(
        {
          exerciseId: plank.id,
          exerciseName: "Plank",
          kind: "longest_hold",
          value: 75,
          previousValue: 60,
          set: { reps: 75, weightKg: 0 },
        },
        plank,
        "kg",
      ).value,
    ).toBe("75 s");
  });

  it("counts them in the heading", () => {
    expect([prHeading(1), prHeading(2)]).toEqual(["1 new personal record", "2 new personal records"]);
  });
});

describe("previewSummary (before the workout syncs)", () => {
  it("works out duration, sets and volume on the phone (its XP is the live score saved at Finish)", () => {
    const START = new Date("2026-11-10T06:00:00.000Z");
    let w = addExercise(
      startWorkout({ userId: "u", clientId: "c", now: START, weightUnit: "kg" }),
      benchPress,
      sequentialIds(),
    );
    const e = w.exercises[0]!;
    w = updateSet(w, e.id, e.sets[0]!.id, { weight: "60", reps: "8" });
    const ticked = toggleSetDone(w, e.id, e.sets[0]!.id, new Date(START.getTime() + 600_000));
    if (!ticked.ok) throw new Error(ticked.message);

    expect(previewSummary(ticked.value, new Date(START.getTime() + 3_600_000).toISOString(), 80)).toEqual({
      durationSec: 3600,
      setCount: 1,
      volumeKg: 480, // volume stays in real kilograms
    });
  });
});

describe("pendingLevelBar (the estimate, before the server answers)", () => {
  const status = { level: 5, xpIntoLevel: 1000, xpForNextLevel: 4000 };

  it("adds the estimate as its own segment after the XP you had", () => {
    expect(pendingLevelBar(status, 600)).toEqual({
      level: 5,
      before: 0.25,
      pending: 0.15,
      progressText: "1,600 / 4,000 XP",
      toNextText: "About 2,400 XP to level 6",
    });
  });

  it("stops at the end of the level and never claims a level up", () => {
    const bar = pendingLevelBar(status, 5000);
    expect(bar).toMatchObject({
      level: 5,
      before: 0.25,
      pending: 0.75,
      progressText: "4,000 / 4,000 XP",
      toNextText: "Your level is confirmed when it syncs",
    });
    expect(bar.before + bar.pending).toBe(1);
    expect(JSON.stringify(bar)).not.toMatch(/level up/i);
  });

  it("treats exactly reaching the end the same way", () => {
    expect(pendingLevelBar(status, 3000).toNextText).toBe("Your level is confirmed when it syncs");
  });
});

describe("explainGap (server set XP vs the estimate saved at Finish)", () => {
  type Tag = Parameters<typeof explainGap>[1]["sets"][number]["tag"];
  const est = (sets: [number, Tag][], heldBack = 0) => ({
    setXp: sets.reduce((sum, [xp]) => sum + xp, 0),
    heldBack,
    sets: sets.map(([xp, tag]) => ({ xp, tag, isFlagged: tag === "check_set" })),
  });
  const server = (
    sets: [number, Tag][],
    extra: { heldBack?: { amount: number; reason: "daily_cap" | "too_old" }; weeklyGoal?: number } = {},
  ) => {
    const setXp = sets.reduce((sum, [xp]) => sum + xp, 0);
    const bonus = extra.weeklyGoal ?? 0;
    return {
      xp: {
        sets: setXp,
        weeklyGoal: bonus,
        streakMilestone: 0,
        total: setXp + bonus,
        heldBack: extra.heldBack ?? null,
      },
      sets: sets.map(([xp, tag], i) => ({ setId: `s${i}`, xp, tag, flagReason: null })),
    };
  };
  /** Every explanation must add up to the gap it explains. */
  const explain = (...args: Parameters<typeof explainGap>) => {
    const result = explainGap(...args);
    if (result) expect(result.lines.reduce((sum, l) => sum + l.amount, 0)).toBe(result.gap);
    return result;
  };

  it("compares set XP only: the weekly bonus is never a gap", () => {
    expect(
      explain(
        est([
          [90, null],
          [90, null],
        ]),
        server(
          [
            [90, null],
            [90, null],
          ],
          { weeklyGoal: 400 },
        ),
      ),
    ).toBeNull();
  });

  it("puts XP held back by another workout that day on the daily limit line", () => {
    // Estimated with nothing held back; the server counted another phone's workout first.
    const result = explain(
      est([
        [90, null],
        [90, null],
      ]),
      server(
        [
          [90, null],
          [60, null],
        ],
        { heldBack: { amount: 30, reason: "daily_cap" } },
      ),
    );
    expect(result).toEqual({
      gap: -30,
      estimateText: "Estimate: +180 XP for sets",
      lines: [{ text: "Daily limit: another workout that day counted first", amount: -30, amountText: "−30 XP" }],
    });
  });

  it("names sets the server tagged differently, with their XP change", () => {
    const result = explain(
      est([
        [90, null],
        [90, null],
        [90, null],
        [90, null],
      ]),
      server([
        [0, "check_set"],
        [70, "above_history"],
        [10, "warm_up"],
        [8, "easy_set"],
      ]),
    );
    expect(result?.lines.map((l) => [l.text, l.amountText])).toEqual([
      ["1 set to check: no XP", "−90 XP"],
      ["1 set above your best: XP as if at +25%", "−20 XP"],
      ["2 sets now warm-ups or easy sets, against your latest history", "−162 XP"],
    ]);
  });

  it("signs the leftover line: up", () => {
    // A heavier bodyweight on the server: every set a little higher, no tag changed.
    expect(
      explain(
        est([
          [90, null],
          [90, null],
        ]),
        server([
          [95, null],
          [95, null],
        ]),
      )?.lines,
    ).toEqual([{ text: "Re-scored on the server", amount: 10, amountText: "+10 XP" }]);
  });

  it("signs the leftover line: down, after the lines it can explain", () => {
    const result = explain(
      est([
        [90, null],
        [90, null],
      ]),
      server([
        [0, "check_set"],
        [85, null],
      ]),
    );
    expect(result?.lines).toEqual([
      { text: "1 set to check: no XP", amount: -90, amountText: "−90 XP" },
      { text: "Re-scored on the server", amount: -5, amountText: "−5 XP" },
    ]);
  });

  it("explains the 14-day rule with one line for the whole gap", () => {
    const result = explain(est([[90, null]]), server([[0, null]], { heldBack: { amount: 90, reason: "too_old" } }));
    expect(result?.lines).toEqual([
      { text: "Synced more than 14 days after it started: no XP for sets", amount: -90, amountText: "−90 XP" },
    ]);
  });

  it("puts the whole gap on the leftover line when the sets don't line up", () => {
    expect(
      explain(
        est([[90, null]]),
        server([
          [90, null],
          [40, null],
        ]),
      )?.lines,
    ).toEqual([{ text: "Re-scored on the server", amount: 40, amountText: "+40 XP" }]);
  });
});
