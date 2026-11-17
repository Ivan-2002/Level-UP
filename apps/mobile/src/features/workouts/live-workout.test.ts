import type { ExerciseSession } from "@levelup/shared";
import { benchPress, plank, pullUp, sequentialIds } from "@/test/fixtures";
import { addExercise, startWorkout, toggleSetDone, updateSet, type ActiveWorkout } from "./active-workout";
import {
  e1rmBars,
  lastSessionText,
  liveXp,
  livePrs,
  nextUp,
  previousSetText,
  suggestedRestText,
  todayBestE1rm,
  workoutSegments,
} from "./live-workout";

const START = new Date("2026-11-10T06:00:00.000Z");
const at = (minutes: number) => new Date(START.getTime() + minutes * 60_000);

/** Fills set n of exercise e, optionally ticking it done at minute `doneAt`. */
function fill(w: ActiveWorkout, e: number, n: number, weight: string, reps: string, doneAt?: number): ActiveWorkout {
  const draft = w.exercises[e]!;
  const next = updateSet(w, draft.id, draft.sets[n]!.id, { weight, reps });
  if (doneAt === undefined) return next;
  const ticked = toggleSetDone(next, draft.id, draft.sets[n]!.id, at(doneAt));
  if (!ticked.ok) throw new Error(ticked.message);
  return ticked.value;
}

/** Bench with 3 sets (new, so the coach leaves them empty) and a pull-up. */
function workout(unit: "kg" | "lb" = "kg") {
  const ids = sequentialIds();
  const lastSets = new Map([[benchPress.id, [8, 8, 8].map((reps) => ({ reps, weightKg: 60 }))]]);
  let w = startWorkout({ userId: "u", clientId: "c", now: START, weightUnit: unit });
  w = addExercise(w, benchPress, ids, lastSets); // 3 sets pre-filled at 62.5 x 8
  w = addExercise(w, pullUp, ids);
  return { ...w, currentExerciseKey: w.exercises[0]!.id };
}

describe("live XP and progress", () => {
  it("adds XP for completed sets only, with the shared formula", () => {
    // Estimated 1RM of the XP load (x sqrt(75 / 80) here) x 0.73:
    let w = fill(workout(), 0, 0, "62.5", "8", 5); // bench: 78.1 kg load -> 70 XP
    w = fill(w, 1, 0, "0", "10", 8); // pull-up: 100 kg load -> 94 XP

    expect(liveXp(w, 80)).toBe(164);
  });

  it("gives one segment per exercise, sized by its sets", () => {
    const w = fill(workout(), 0, 0, "62.5", "8", 5);
    expect(workoutSegments(w)).toEqual({ segments: [{ total: 3, done: 1 }, { total: 1, done: 0 }], currentIndex: 0 });
  });
});

describe("PRs while you train", () => {
  it("marks every set that beats the best so far, history first, then earlier sets today", () => {
    let w = fill(workout(), 0, 0, "62.5", "8", 5); // e1RM 79.2
    w = fill(w, 0, 1, "65", "8", 9); // 82.3
    w = fill(w, 0, 2, "62.5", "8", 12); // 79.2: not a PR any more

    const prs = livePrs(w.exercises[0]!, "kg", 80, 78);

    expect([...prs.values()]).toEqual([79.2, 82.3]);
    expect(todayBestE1rm(w.exercises[0]!, "kg", 80)).toBe(82.3);
  });

  it("has no PRs in the first session ever (it sets the baseline)", () => {
    const w = fill(workout(), 0, 0, "100", "5", 5);
    expect(livePrs(w.exercises[0]!, "kg", 80, null).size).toBe(0);
  });

  it("counts bodyweight in a pull-up's estimate", () => {
    const w = fill(workout(), 1, 0, "10", "3", 5); // 90 kg lifted x 1.1 = 99
    expect(todayBestE1rm(w.exercises[1]!, "kg", 80)).toBe(99);
  });
});

describe("text", () => {
  it("shows last time's set n in the player's unit, without the unit (the column has it)", () => {
    const last = [{ reps: 8, weightKg: 61.235 }];
    expect(previousSetText(last, 0, benchPress, "lb")).toBe("135 × 8");
    expect(previousSetText(last, 1, benchPress, "lb")).toBe("—");
    expect(previousSetText([{ reps: 9, weightKg: 0 }], 0, pullUp, "kg")).toBe("BW × 9");
    expect(previousSetText([{ reps: 60, weightKg: 0 }], 0, plank, "kg")).toBe("60 s");
  });

  it("summarises last time compactly when one weight was used", () => {
    expect(lastSessionText([8, 8, 7, 8].map((reps) => ({ reps, weightKg: 60 })), benchPress, "kg")).toBe("60 kg × 8, 8, 7, 8");
    expect(lastSessionText([{ reps: 8, weightKg: 60 }, { reps: 6, weightKg: 62.5 }], benchPress, "kg")).toBe("60 × 8, 62.5 × 6");
    expect(lastSessionText([{ reps: 9, weightKg: 0 }], pullUp, "kg")).toBe("BW × 9");
  });

  it("says what's next: this exercise's next set, then the next exercise, then nothing", () => {
    let w = fill(workout(), 0, 0, "62.5", "8", 5);
    expect(nextUp(w)).toBe("set 2 · 62.5 kg × 8");

    w = fill(fill(w, 0, 1, "62.5", "8", 8), 0, 2, "62.5", "7", 11);
    expect(nextUp(w)).toBe("Pull-up · BW × ?");

    w = fill(w, 1, 0, "", "10", 15);
    expect(nextUp(w)).toBeNull();
  });

  it("suggests a rest range by kind of lift", () => {
    expect(suggestedRestText("compound")).toBe("Suggested 2:00–3:00 for compound lifts");
    expect(suggestedRestText("isolation")).toBe("Suggested 0:45–1:30 for isolation work");
  });
});

describe("e1rmBars", () => {
  const session = (day: number, bestE1rm: number | null): ExerciseSession => ({
    workoutId: `w${day}`,
    startedAt: new Date(2026, 9, day, 12).toISOString(),
    bodyweightKg: 80,
    sets: [],
    bestE1rm,
    volumeKg: 0,
    topSet: null,
  });

  it("shows the last 5 sessions oldest first, then today, purple when it's a PR", () => {
    // Newest first, as the API sends them. The 16 Oct session has no estimate (all sets over 12 reps).
    const newestFirst = [session(30, 76), session(23, 73), session(16, null), session(9, 73), session(5, 72), session(3, 70), session(1, 69)];

    expect(e1rmBars(newestFirst, 79).map((b) => [b.label, b.value, b.tone])).toEqual([
      ["3 Oct", 70, "past"],
      ["5 Oct", 72, "past"],
      ["9 Oct", 73, "past"],
      ["23 Oct", 73, "past"],
      ["30 Oct", 76, "past"],
      ["Today", 79, "today_pr"],
    ]);
  });

  it("isn't a PR when today doesn't beat the past, or there is no past", () => {
    expect(e1rmBars([session(30, 80)], 79).at(-1)!.tone).toBe("today");
    expect(e1rmBars([], 79)).toEqual([{ label: "Today", value: 79, tone: "today" }]);
    expect(e1rmBars([session(30, 80)], null).at(-1)).toEqual({ label: "Today", value: null, tone: "today" });
  });
});
