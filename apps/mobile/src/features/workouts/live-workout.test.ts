import { epleyOneRepMax, JUMP_CAP_TEXT, scoreSessionSets, type ExerciseSession, type ExerciseXpHistory } from "@levelup/shared";
import { benchPress, plank, pullUp, sequentialIds } from "@/test/fixtures";
import { addExercise, buildFinishPayload, startWorkout, toggleSetDone, updateSet, type ActiveWorkout } from "./active-workout";
import {
  e1rmBars,
  lastSessionText,
  livePrs,
  nextUp,
  pinContext,
  previousSetText,
  scoreLiveWorkout,
  setXpNote,
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
    // Estimated 1RM of the XP load (x sqrt(75 / 80) here) x 0.73, at full effort:
    let w = fill(workout(), 0, 0, "62.5", "8", 5); // bench: 78.1 kg load -> 70 XP
    w = fill(w, 1, 0, "0", "10", 8); // pull-up: 100 kg load -> 94 XP

    expect(scoreLiveWorkout(w, { history: new Map(), bodyweight: { xp: 80, typed: 80 } }).total).toBe(164);
  });

  it("gives one segment per exercise, sized by its sets", () => {
    const w = fill(workout(), 0, 0, "62.5", "8", 5);
    expect(workoutSegments(w)).toEqual({ segments: [{ total: 3, done: 1 }, { total: 1, done: 0 }], currentIndex: 0 });
  });
});

describe("scoreLiveWorkout: the live preview runs the server's pipeline", () => {
  const noHistory = { history: new Map<string, ExerciseXpHistory>(), bodyweight: { xp: 80, typed: 80 } };

  it("scores exactly the sets Finish sends, in the order the server scores them", () => {
    let w: ActiveWorkout = { ...workout(), clientId: "6f1d1c1e-0000-4000-8000-000000000001" }; // Finish needs a UUID
    w = fill(w, 0, 0, "62.5", "8", 5);
    w = fill(w, 1, 0, "0", "10", 8); // the pull-up, ticked between bench sets
    w = fill(w, 0, 1, "65", "8", 11);
    w = fill(w, 0, 2, "65", "6", 14);

    const payload = buildFinishPayload(w, at(20));
    if (!payload.ok) throw new Error(payload.message);
    const server = scoreSessionSets({
      sets: payload.value.exercises.flatMap((e) => e.sets.map((s) => ({ exerciseId: e.exerciseId, reps: s.reps, weightKg: s.weightKg }))),
      exercises: new Map([benchPress, pullUp].map((e) => [e.id, e])),
      ...noHistory,
    });

    const live = scoreLiveWorkout(w, noHistory);

    expect(live.total).toBe(server.sets.reduce((sum, s) => sum + s.xp, 0));
    const doneIds = [...w.exercises[0]!.sets, ...w.exercises[1]!.sets].map((set) => set.id); // payload order
    expect(doneIds.map((id) => live.bySet.get(id))).toEqual(server.sets);
    expect(live.exercises).toEqual(server.exercises);
  });

  it("leaves out sets that aren't done", () => {
    const w = fill(workout(), 0, 0, "62.5", "8", 5); // sets 2 and 3 are filled in but not ticked
    expect([...scoreLiveWorkout(w, noHistory).bySet.keys()]).toEqual([w.exercises[0]!.sets[0]!.id]);
  });

  it("uses the cached history: a jump far above the best is held to the line and tagged", () => {
    const history = new Map([[benchPress.id, { recentBest: epleyOneRepMax(50, 8), jumpBaseline: epleyOneRepMax(50, 8) }]]);
    const w = fill(workout(), 0, 0, "65", "8", 5); // 30% above 50 x 8 (the line is +25%)

    const set = scoreLiveWorkout(w, { history, bodyweight: { xp: 80, typed: 80 } }).bySet.get(w.exercises[0]!.sets[0]!.id)!;
    const fresh = scoreLiveWorkout(w, noHistory).bySet.get(w.exercises[0]!.sets[0]!.id)!;

    expect(set).toMatchObject({ tag: "above_history", flagReason: "above_history" });
    expect(set.xp).toBeLessThan(fresh.xp);
  });

  it("tags an easy set against the 12-week best", () => {
    const history = new Map([[benchPress.id, { recentBest: epleyOneRepMax(120, 8), jumpBaseline: epleyOneRepMax(120, 8) }]]);
    const w = fill(workout(), 0, 0, "62.5", "8", 5);

    expect(scoreLiveWorkout(w, { history, bodyweight: { xp: 80, typed: 80 } }).bySet.get(w.exercises[0]!.sets[0]!.id)).toMatchObject({ tag: "easy_set" });
  });
});

describe("re-scoring earlier sets as the session goes on", () => {
  const context = { history: new Map<string, ExerciseXpHistory>(), bodyweight: { xp: 80, typed: 80 } };

  it("turns 60 x 5 into a warm-up once 100 x 5 follows it", () => {
    let w = fill(workout(), 0, 0, "60", "5", 5);
    const first = w.exercises[0]!.sets[0]!.id;
    const alone = scoreLiveWorkout(w, context).bySet.get(first)!;
    // On its own it's the session's best: full effort, no tag.
    expect(alone).toMatchObject({ tag: null, effort: 1 });

    w = fill(w, 0, 1, "100", "5", 9);
    const after = scoreLiveWorkout(w, context);
    const rescored = after.bySet.get(first)!;

    // Now measured against 100 x 5: low effort, before the heaviest set -> a warm-up.
    expect(rescored.tag).toBe("warm_up");
    expect(rescored.xp).toBeLessThan(alone.xp);
    expect(setXpNote(rescored).text).toBe(`+${rescored.xp} XP · Warm-up`);
    // The total is always the sum of what the rows show: no hidden carry-over.
    expect(after.total).toBe([...after.bySet.values()].reduce((sum, s) => sum + s.xp, 0));
  });
});

describe("pinContext: the total only moves when a set does", () => {
  const history = new Map<string, ExerciseXpHistory>([[benchPress.id, { recentBest: 100, jumpBaseline: 100 }]]);
  const bodyweight = { xp: 80, typed: 80 };

  it("waits for the history before the first tick, then keeps it for the whole workout", () => {
    const w = workout();
    expect(pinContext(null, w, { history: undefined, bodyweight })).toBeNull();

    const pinned = pinContext(null, w, { history, bodyweight })!;
    // A refetch (new history object, a changed XP bodyweight) doesn't change it.
    const later = pinContext(pinned, w, { history: new Map(), bodyweight: { xp: 70, typed: 70 } });
    expect(later).toBe(pinned);
  });

  it("pins with an empty history once a set is ticked offline before any history arrived", () => {
    const w = fill(workout(), 0, 0, "60", "5", 5);
    expect(pinContext(null, w, { history: undefined, bodyweight })?.context.history.size).toBe(0);
  });

  it("takes a fresh context for the next workout", () => {
    const pinned = pinContext(null, workout(), { history, bodyweight })!;
    const next = { ...workout(), clientId: "next" };
    expect(pinContext(pinned, next, { history, bodyweight })).not.toBe(pinned);
  });
});

describe("setXpNote", () => {
  const base = { xp: 70, effort: 1, flagReason: null, isFlagged: false };

  it("shows the XP, then the tag when there is one", () => {
    expect(setXpNote({ ...base, tag: null })).toEqual({ text: "+70 XP", tone: "inkMuted" });
    expect(setXpNote({ ...base, xp: 3, tag: "easy_set" })).toEqual({ text: "+3 XP · Easy set", tone: "inkMuted" });
  });

  it("explains a jump-capped set with the fixed sentence", () => {
    expect(setXpNote({ ...base, tag: "above_history", flagReason: "above_history" })).toEqual({
      text: "+70 XP · Above your best · +25%",
      tone: "inkMuted",
      detail: JUMP_CAP_TEXT,
    });
  });

  it("shows a flagged set as 0 XP in red", () => {
    expect(setXpNote({ ...base, xp: 0, tag: "check_set", flagReason: "weight_above_range", isFlagged: true })).toEqual({ text: "0 XP · Check this set", tone: "danger" });
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
