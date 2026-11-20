import { JUMP_CAP_TEXT } from "@levelup/shared";
import { benchPress, plank, pullUp, sequentialIds } from "@/test/fixtures";
import { addExercise, startWorkout, toggleSetDone, updateSet } from "./active-workout";
import {
  compareCount,
  compareDuration,
  compareVolume,
  exerciseXpRows,
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
    expect([compareCount(18, 16), compareCount(15, 16), compareCount(18, 18)].map((c) => c?.text)).toEqual(["+2 vs last", "−1 vs last", "Same as last"]);
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
    const bar = levelBar({ level: 5, xpIntoLevel: 100, xpForNextLevel: 4000 }, { level: 5, xpIntoLevel: 300, xpForNextLevel: 4000 });

    expect(bar).toMatchObject({ level: 5, levelsGained: 0, levelText: "Level 5", levelUpText: null, progressText: "300 / 4,000 XP", toNextText: "3,700 XP to level 6" });
    expect(bar.before).toBeCloseTo(100 / 4000);
    expect(bar.gained).toBeCloseTo(200 / 4000);
  });

  it("counts everything in a new level as this workout's gain", () => {
    const bar = levelBar({ level: 1, xpIntoLevel: 390, xpForNextLevel: 400 }, { level: 2, xpIntoLevel: 40, xpForNextLevel: 2200 });
    expect(bar).toMatchObject({ level: 2, levelsGained: 1, levelText: "Level 2", levelUpText: "Level up! You reached level 2.", before: 0 });
    expect(bar.gained).toBeCloseTo(40 / 2200);
  });

  it("shows only the new level's progress when more than one level was gained (Level 4 → 6)", () => {
    // Level 4 nearly full, then a big workout plus a streak bonus: through level 5 into 6.
    const bar = levelBar({ level: 4, xpIntoLevel: 3500, xpForNextLevel: 3600 }, { level: 6, xpIntoLevel: 900, xpForNextLevel: 6000 });

    expect(bar).toMatchObject({ level: 6, levelsGained: 2, levelText: "Level 4 → 6", levelUpText: "Level up! You went from level 4 to 6." });
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
    const lines = xpLines({ xp: { ...xp, weeklyGoal: 400, streakMilestone: 3000, total: 4640 }, weeklyGoal: { streak: 12 } as never });
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
    expect(heldBackText({ amount: 500, reason: "too_old" })).toBe("No XP for sets: it synced more than 14 days after it started.");
  });
});

describe("exerciseXpRows", () => {
  const exercise = (id: string, name: string, setIds: string[]) => ({ id, exercise: { name } as never, sets: setIds.map((sid) => ({ id: sid }) as never) }) as never;

  it("sums each exercise's XP and lists only its tagged sets, numbered within the exercise", () => {
    const rows = exerciseXpRows({ exercises: [exercise("e1", "Bench Press", ["a", "b", "c"]), exercise("e2", "Back Squat", ["d"])] }, [
      { setId: "a", xp: 5, tag: "warm_up", flagReason: null },
      { setId: "b", xp: 90, tag: null, flagReason: null },
      { setId: "c", xp: 0, tag: "check_set", flagReason: "weight_above_range" },
      { setId: "d", xp: 70, tag: "above_history", flagReason: "above_history" },
    ]);

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
      { key: "e2", name: "Back Squat", xp: 70, tagged: [{ text: "Set 1 · Above your best · +25% · +70 XP", tone: "inkMuted", detail: JUMP_CAP_TEXT }] },
    ]);
  });
});

describe("PR lines", () => {
  const set = { reps: 6, weightKg: 65 };

  it("describes an estimated 1RM PR with the set that set it, in the player's unit", () => {
    expect(prLine({ exerciseId: benchPress.id, exerciseName: "Bench Press", kind: "e1rm", value: 78, previousValue: 76, set }, benchPress, "kg")).toEqual({
      detail: "65 kg × 6 · est. 1RM",
      value: "78 kg",
      was: "was 76",
    });
  });

  it("describes reps at a weight and a longest hold", () => {
    expect(prLine({ exerciseId: pullUp.id, exerciseName: "Pull-up", kind: "reps_at_weight", value: 14, previousValue: 12, set: { reps: 14, weightKg: 0 } }, pullUp, "kg")).toEqual({
      detail: "Most reps at BW",
      value: "14 reps",
      was: "was 12",
    });
    expect(prLine({ exerciseId: plank.id, exerciseName: "Plank", kind: "longest_hold", value: 75, previousValue: 60, set: { reps: 75, weightKg: 0 } }, plank, "kg").value).toBe("75 s");
  });

  it("counts them in the heading", () => {
    expect([prHeading(1), prHeading(2)]).toEqual(["1 new personal record", "2 new personal records"]);
  });
});

describe("previewSummary (before the workout syncs)", () => {
  it("works out duration, sets and volume on the phone (its XP is the live score saved at Finish)", () => {
    const START = new Date("2026-11-10T06:00:00.000Z");
    let w = addExercise(startWorkout({ userId: "u", clientId: "c", now: START, weightUnit: "kg" }), benchPress, sequentialIds());
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
    expect(bar).toMatchObject({ level: 5, before: 0.25, pending: 0.75, progressText: "4,000 / 4,000 XP", toNextText: "Your level is confirmed when it syncs" });
    expect(bar.before + bar.pending).toBe(1);
    expect(JSON.stringify(bar)).not.toMatch(/level up/i);
  });

  it("treats exactly reaching the end the same way", () => {
    expect(pendingLevelBar(status, 3000).toNextText).toBe("Your level is confirmed when it syncs");
  });
});
