import {
  applyDailyCap,
  epleyOneRepMax,
  JUMP_CAP_TEXT,
  scoreSessionSets,
  type ExerciseSession,
  type ExerciseXpHistory,
} from "@levelup/shared";
import { benchPress, plank, pullUp, sequentialIds } from "@/test/fixtures";
import {
  addExercise,
  addSet,
  buildFinishPayload,
  doneSetError,
  endEditing,
  pinScoring,
  removeSet,
  startWorkout,
  toggleSetDone,
  updateSet,
  type ActiveWorkout,
} from "./active-workout";
import {
  BASELINE_CAPTION,
  dailyCapNote,
  e1rmBars,
  lastSessionText,
  livePrs,
  nextUp,
  scoringContext,
  snapshotToPin,
  previousSetText,
  scoreLiveWorkout,
  setXpNote,
  showsBaselineCaption,
  suggestedRestText,
  tickFeedback,
  tickLine,
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

    expect(scoreLiveWorkout(w, { history: new Map(), bodyweight: { xp: 80, typed: 80 }, dailyCap: null }).total).toBe(
      164,
    );
  });

  it("gives one segment per exercise, sized by its sets", () => {
    const w = fill(workout(), 0, 0, "62.5", "8", 5);
    expect(workoutSegments(w)).toEqual({
      segments: [
        { total: 3, done: 1 },
        { total: 1, done: 0 },
      ],
      currentIndex: 0,
    });
  });
});

describe("scoreLiveWorkout: the live preview runs the server's pipeline", () => {
  const noHistory = {
    history: new Map<string, ExerciseXpHistory>(),
    bodyweight: { xp: 80, typed: 80 },
    dailyCap: null,
  };

  it("scores exactly the sets Finish sends, in the order the server scores them", () => {
    let w: ActiveWorkout = { ...workout(), clientId: "6f1d1c1e-0000-4000-8000-000000000001" }; // Finish needs a UUID
    w = fill(w, 0, 0, "62.5", "8", 5);
    w = fill(w, 1, 0, "0", "10", 8); // the pull-up, ticked between bench sets
    w = fill(w, 0, 1, "65", "8", 11);
    w = fill(w, 0, 2, "65", "6", 14);

    const payload = buildFinishPayload(w, at(20));
    if (!payload.ok) throw new Error(payload.message);
    const server = scoreSessionSets({
      sets: payload.value.exercises.flatMap((e) =>
        e.sets.map((s) => ({ exerciseId: e.exerciseId, reps: s.reps, weightKg: s.weightKg })),
      ),
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
    const history = new Map([
      [benchPress.id, { recentBest: epleyOneRepMax(50, 8), jumpBaseline: epleyOneRepMax(50, 8) }],
    ]);
    const w = fill(workout(), 0, 0, "65", "8", 5); // 30% above 50 x 8 (the line is +25%)

    const set = scoreLiveWorkout(w, { history, bodyweight: { xp: 80, typed: 80 }, dailyCap: null }).bySet.get(
      w.exercises[0]!.sets[0]!.id,
    )!;
    const fresh = scoreLiveWorkout(w, noHistory).bySet.get(w.exercises[0]!.sets[0]!.id)!;

    expect(set).toMatchObject({ tag: "above_history", flagReason: "above_history" });
    expect(set.xp).toBeLessThan(fresh.xp);
  });

  it("tags light sets against the 12-week best: a warm-up before any working set, an easy set after one", () => {
    const history = new Map([
      [benchPress.id, { recentBest: epleyOneRepMax(120, 8), jumpBaseline: epleyOneRepMax(120, 8) }],
    ]);
    let w = fill(workout(), 0, 0, "62.5", "8", 5);
    w = fill(w, 0, 1, "115", "8", 9);
    w = fill(w, 0, 2, "62.5", "8", 13);
    const score = scoreLiveWorkout(w, { history, bodyweight: { xp: 80, typed: 80 }, dailyCap: null });

    expect(w.exercises[0]!.sets.map((s) => score.bySet.get(s.id)!.tag)).toEqual(["warm_up", null, "easy_set"]);
  });
});

describe("re-scoring earlier sets: only in a baseline session", () => {
  const context = { history: new Map<string, ExerciseXpHistory>(), bodyweight: { xp: 80, typed: 80 }, dailyCap: null };
  // Last time's best on bench: 100 x 5.
  const withHistory = {
    history: new Map([[benchPress.id, { recentBest: epleyOneRepMax(100, 5), jumpBaseline: epleyOneRepMax(100, 5) }]]),
    bodyweight: { xp: 80, typed: 80 },
    dailyCap: null,
  };

  it("baseline session (no history): turns 60 x 5 into a warm-up once 100 x 5 follows it", () => {
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

  it("with history: a done row's XP and tag never change when a heavier set is ticked", () => {
    let w = fill(workout(), 0, 0, "60", "5", 5);
    const first = w.exercises[0]!.sets[0]!.id;
    const before = scoreLiveWorkout(w, withHistory).bySet.get(first)!;
    expect(before.tag).toBe("warm_up");

    w = fill(w, 0, 1, "100", "5", 9);
    w = fill(w, 0, 2, "102.5", "5", 13); // beats last time's best
    expect(scoreLiveWorkout(w, withHistory).bySet.get(first)).toEqual(before);
  });

  it("scores in the order ticked: a heavier set higher in the list, ticked later, doesn't re-score the rows ticked before it", () => {
    // Set 1 is 100 x 5 but ticked last; sets 2 and 3 (60 x 5) were ticked first.
    let w = fill(workout(), 0, 1, "60", "5", 1);
    w = fill(w, 0, 2, "60", "5", 4);
    const sixty = w.exercises[0]!.sets[1]!.id;
    const before = scoreLiveWorkout(w, withHistory).bySet.get(sixty)!;

    w = fill(w, 0, 0, "100", "5", 9);
    expect(scoreLiveWorkout(w, withHistory).bySet.get(sixty)).toEqual(before);
    expect(before.tag).toBe("warm_up"); // in list order it would follow a working set: an easy set
  });
});

describe("snapshotToPin: the total only moves when a set does", () => {
  const history = new Map<string, ExerciseXpHistory>([[benchPress.id, { recentBest: 100, jumpBaseline: 100 }]]);
  const bodyweight = { xp: 80, typed: 80 };

  it("waits for the history before the first tick, then pins it once", () => {
    const w = workout();
    expect(snapshotToPin(w, { history: undefined, bodyweight, dailyCap: null })).toBeNull();

    const snapshot = snapshotToPin(w, { history, bodyweight, dailyCap: null })!;
    expect(snapshot).toEqual({
      history: [{ exerciseId: benchPress.id, recentBest: 100, jumpBaseline: 100 }],
      bodyweight,
      dailyCap: null,
    });
    // Once pinned, a refetch (new history, a changed XP bodyweight) has nothing to pin.
    const pinned = pinScoring(w, snapshot);
    expect(snapshotToPin(pinned, { history: new Map(), bodyweight: { xp: 70, typed: 70 }, dailyCap: null })).toBeNull();
    expect(pinScoring(pinned, { history: [], bodyweight: { xp: 70, typed: 70 }, dailyCap: null })).toBe(pinned);
  });

  it("pins with an empty history once a set is ticked offline before any history arrived", () => {
    const w = fill(workout(), 0, 0, "60", "5", 5);
    expect(snapshotToPin(w, { history: undefined, bodyweight, dailyCap: null })?.history).toEqual([]);
  });

  it("gives back the same scoring context it saved (JSON in between, as on the phone)", () => {
    const saved = JSON.parse(JSON.stringify(snapshotToPin(workout(), { history, bodyweight, dailyCap: null })));
    expect(scoringContext(saved)).toEqual({ history, bodyweight, dailyCap: null });
  });

  it("starts every new workout unpinned", () => {
    expect(workout().scoring).toBeNull();
  });
});

describe("editing done sets", () => {
  const context = { history: new Map<string, ExerciseXpHistory>(), bodyweight: { xp: 80, typed: 80 }, dailyCap: null };
  // Last time's best on bench: 100 x 8, so these are scored looking back only.
  const withHistory = {
    ...context,
    history: new Map([[benchPress.id, { recentBest: epleyOneRepMax(100, 8), jumpBaseline: epleyOneRepMax(100, 8) }]]),
  };
  const ticked = () => fill(fill(workout(), 0, 0, "100", "8", 5), 0, 1, "100", "8", 9);
  const setId = (w: ActiveWorkout, n: number) => w.exercises[0]!.sets[n]!.id;
  const edit = (w: ActiveWorkout, n: number, changes: { weight?: string; reps?: string }) =>
    updateSet(w, w.exercises[0]!.id, setId(w, n), changes);

  it("doesn't move the score while a done set is typed in, then re-scores once when editing ends", () => {
    let w = ticked();
    const before = scoreLiveWorkout(w, withHistory);

    // Typing 102.5 over 100: every in-between value ("1", "10", "102", "102.") is ignored.
    for (const weight of ["1", "10", "102", "102.", "102.5"]) {
      w = edit(w, 0, { weight });
      expect(scoreLiveWorkout(w, withHistory)).toEqual(before);
    }
    w = endEditing(w);
    const after = scoreLiveWorkout(w, withHistory);
    expect(after.bySet.get(setId(w, 0))!.xp).toBeGreaterThan(before.bySet.get(setId(w, 0))!.xp);
    expect(after.bySet.get(setId(w, 1))).toEqual(before.bySet.get(setId(w, 1))); // the other row: unchanged
  });

  it("keeps an invalid edit out of the score and says why, once editing ends", () => {
    let w = edit(ticked(), 0, { reps: "" });
    w = endEditing(w);
    const set = w.exercises[0]!.sets[0]!;

    expect(set.scored).toEqual({ weight: "100", reps: "8" });
    expect(scoreLiveWorkout(w, withHistory)).toEqual(scoreLiveWorkout(ticked(), withHistory));
    expect(doneSetError(set, benchPress, "kg")).toMatch(/counts as it was when ticked/);
    expect(doneSetError(ticked().exercises[0]!.sets[0]!, benchPress, "kg")).toBeNull();
  });

  it("keeps a cleared weight on a loaded lift out of the score (not 0 kg); a typed 0 is 0 kg", () => {
    let w = endEditing(edit(ticked(), 0, { weight: "" }));
    expect(w.exercises[0]!.sets[0]!.scored).toEqual({ weight: "100", reps: "8" });
    expect(scoreLiveWorkout(w, withHistory)).toEqual(scoreLiveWorkout(ticked(), withHistory));

    w = endEditing(edit(w, 0, { weight: "0" }));
    expect(w.exercises[0]!.sets[0]!.scored).toEqual({ weight: "0", reps: "8" });
  });

  it("still lets an empty weight mean bodyweight only on a bodyweight exercise", () => {
    const base = workout();
    let w = updateSet(base, base.exercises[1]!.id, base.exercises[1]!.sets[0]!.id, { weight: "", reps: "8" });
    const r = toggleSetDone(w, w.exercises[1]!.id, w.exercises[1]!.sets[0]!.id, at(5)); // pull-up
    if (!r.ok) throw new Error(r.message);
    w = r.value;
    expect(scoreLiveWorkout(w, context).bySet.get(w.exercises[1]!.sets[0]!.id)!.xp).toBeGreaterThan(0);
  });

  it("ends editing when another set is ticked", () => {
    let w = edit(ticked(), 0, { weight: "105" });
    w = fill(w, 0, 2, "100", "8", 13); // ticks set 3
    expect(w.exercises[0]!.sets[0]!.scored).toEqual({ weight: "105", reps: "8" });
  });

  it("returns the same workout when no done set changed (no re-render, no save)", () => {
    const w = ticked();
    expect(endEditing(w)).toBe(w);
  });

  it("untick: the set leaves the score; with history, the other rows don't change", () => {
    const w = ticked();
    const before = scoreLiveWorkout(w, withHistory);
    const result = toggleSetDone(w, w.exercises[0]!.id, setId(w, 0), at(20));
    if (!result.ok) throw new Error(result.message);
    const after = scoreLiveWorkout(result.value, withHistory);

    expect(result.value.exercises[0]!.sets[0]!.scored).toBeNull();
    expect(after.bySet.has(setId(w, 0))).toBe(false);
    expect(after.bySet.get(setId(w, 1))).toEqual(before.bySet.get(setId(w, 1)));
    expect(after.total).toBe(before.total - before.bySet.get(setId(w, 0))!.xp);
  });

  it("delete: a removed done set leaves the score; with history, the other rows don't change", () => {
    const w = ticked();
    const before = scoreLiveWorkout(w, withHistory);
    const after = scoreLiveWorkout(removeSet(w, w.exercises[0]!.id, setId(w, 0)), withHistory);

    expect(after.bySet.get(setId(w, 1))).toEqual(before.bySet.get(setId(w, 1)));
    expect(after.total).toBe(before.total - before.bySet.get(setId(w, 0))!.xp);
  });

  it("re-ticking a set scores what's typed then", () => {
    let w = ticked();
    const toggle = (n: number, minute: number) => {
      const r = toggleSetDone(w, w.exercises[0]!.id, setId(w, n), at(minute));
      if (!r.ok) throw new Error(r.message);
      w = r.value;
    };
    toggle(0, 20); // untick
    w = edit(w, 0, { weight: "90" });
    toggle(0, 21); // tick again
    expect(w.exercises[0]!.sets[0]!.scored).toEqual({ weight: "90", reps: "8" });
  });
});

describe("feedback on a tick: the announcement, the tick line and the baseline caption", () => {
  const noHistory = {
    history: new Map<string, ExerciseXpHistory>(),
    bodyweight: { xp: 80, typed: 80 },
    dailyCap: null,
  };
  const withHistory = {
    ...noHistory,
    history: new Map([[benchPress.id, { recentBest: epleyOneRepMax(100, 5), jumpBaseline: epleyOneRepMax(100, 5) }]]),
  };
  /** Three 60 x 5 sets, then 100 x 5 in a fourth set (added after the three planned ones). */
  function rampThenHeavy() {
    let w = fill(fill(fill(workout(), 0, 0, "60", "5", 1), 0, 1, "60", "5", 4), 0, 2, "60", "5", 7);
    w = addSet(w, w.exercises[0]!.id, () => "set-4");
    return { before: w, after: fill(w, 0, 3, "100", "5", 10) };
  }

  it("baseline session: leads with the gain, names the re-scored sets, and gives the new total", () => {
    const { before, after } = rampThenHeavy();
    const was = scoreLiveWorkout(before, noHistory);
    const now = scoreLiveWorkout(after, noHistory);
    const heavy = now.bySet.get("set-4")!;
    const feedback = tickFeedback({ setId: "set-4", setNumber: 4, done: true, before: was, after: now });

    expect(now.total).toBeLessThan(was.total + heavy.xp); // the earlier rows lost XP
    expect(feedback).toEqual({
      announcement: `Set 4 done, plus ${heavy.xp} XP, ${now.total} total. 3 earlier sets now warm-ups.`,
      rescoredAsWarmUps: 3,
    });
    // The row: the gain first, no minus number (the total shows the net change).
    expect(tickLine(setXpNote(heavy), 3).text).toBe(`+${heavy.xp} XP · 3 earlier sets now warm-ups`);
  });

  it("says nothing about re-scoring when nothing was (with history)", () => {
    const { before, after } = rampThenHeavy();
    const now = scoreLiveWorkout(after, withHistory);
    const feedback = tickFeedback({
      setId: "set-4",
      setNumber: 4,
      done: true,
      before: scoreLiveWorkout(before, withHistory),
      after: now,
    });
    expect(feedback).toEqual({
      announcement: `Set 4 done, plus ${now.bySet.get("set-4")!.xp} XP, ${now.total} total.`,
      rescoredAsWarmUps: 0,
    });
    expect(tickLine({ text: "+85 XP", tone: "inkMuted" }, 0).text).toBe("+85 XP");
  });

  it("uses the singular for one re-scored set", () => {
    let w = fill(workout(), 0, 0, "60", "5", 1);
    const before = scoreLiveWorkout(w, noHistory);
    w = fill(w, 0, 1, "100", "5", 4);
    const feedback = tickFeedback({
      setId: w.exercises[0]!.sets[1]!.id,
      setNumber: 2,
      done: true,
      before,
      after: scoreLiveWorkout(w, noHistory),
    });
    expect(feedback.announcement).toMatch(/\. 1 earlier set now a warm-up\.$/);
  });

  it("announces an untick with the new total", () => {
    const { after } = rampThenHeavy();
    const result = toggleSetDone(after, after.exercises[0]!.id, "set-4", at(12));
    if (!result.ok) throw new Error(result.message);
    const now = scoreLiveWorkout(result.value, noHistory);
    expect(
      tickFeedback({
        setId: "set-4",
        setNumber: 4,
        done: false,
        before: scoreLiveWorkout(after, noHistory),
        after: now,
      }).announcement,
    ).toBe(`Set 4 not done, ${now.total} total`);
  });

  it("announces just the tick before anything is pinned", () => {
    expect(tickFeedback({ setId: "s", setNumber: 1, done: true, before: null, after: null }).announcement).toBe(
      "Set 1 done",
    );
  });

  it("adds the daily cap line when this tick reached it", () => {
    const capped = {
      ...noHistory,
      dailyCap: { config: { limit: 3100, bandRate: 0.25, ceilingMultiple: 2 }, xpBefore: 3000 },
    };
    let w = fill(workout(), 0, 0, "60", "5", 1);
    const before = scoreLiveWorkout(w, capped);
    w = fill(w, 0, 1, "100", "8", 4);
    const after = scoreLiveWorkout(w, capped);
    expect(before.dailyCapNote).toBeNull();
    expect(
      tickFeedback({ setId: w.exercises[0]!.sets[1]!.id, setNumber: 2, done: true, before, after }).announcement,
    ).toMatch(/Daily limit reached: sets now earn 25%\.$/);
  });

  it("captions a baseline session's reps exercise only", () => {
    expect(BASELINE_CAPTION).toBe("First session: this sets your baseline. Earlier sets may be re-scored as warm-ups.");
    expect(showsBaselineCaption(benchPress, noHistory)).toBe(true);
    expect(showsBaselineCaption(benchPress, withHistory)).toBe(false);
    expect(showsBaselineCaption(plank, noHistory)).toBe(false); // timed: no warm-ups
    expect(showsBaselineCaption(benchPress, null)).toBe(false); // nothing pinned yet
  });
});

describe("the daily cap, live", () => {
  const cap = { limit: 3100, bandRate: 0.25, ceilingMultiple: 2 };
  const noCap = { history: new Map<string, ExerciseXpHistory>(), bodyweight: { xp: 80, typed: 80 }, dailyCap: null };
  const twoSets = () => fill(fill(workout(), 0, 0, "100", "8", 5), 0, 1, "100", "8", 9);

  it("leaves the score alone on a normal day", () => {
    const w = twoSets();
    const uncapped = scoreLiveWorkout(w, noCap);
    const capped = scoreLiveWorkout(w, { ...noCap, dailyCap: { config: cap, xpBefore: 500 } });
    expect(capped.total).toBe(uncapped.total);
    expect(capped).toMatchObject({ heldBack: 0, dailyCapNote: null });
  });

  it("applies the cap from the day's XP so far, in the order sent, and says so", () => {
    const w = twoSets();
    const raw = [...scoreLiveWorkout(w, noCap).bySet.values()].map((s) => s.xp);
    const expected = applyDailyCap(3050, raw, cap);

    const live = scoreLiveWorkout(w, { ...noCap, dailyCap: { config: cap, xpBefore: 3050 } });
    // Rows show the XP awarded, as the summary will.
    expect([...live.bySet.values()].map((s) => s.xp)).toEqual(expected.awarded);
    expect(live.total).toBe(expected.awarded.reduce((a, b) => a + b, 0));
    expect(live.heldBack).toBe(expected.heldBack);
    expect(live.dailyCapNote).toBe("Daily limit reached: sets now earn 25%");
  });

  it("uses the server's values, not built-in ones", () => {
    expect(dailyCapNote({ limit: 2000, bandRate: 0.1, ceilingMultiple: 2 }, 2100)).toBe(
      "Daily limit reached: sets now earn 10%",
    );
    expect(dailyCapNote(cap, 6200)).toBe("Daily maximum reached: sets earn no more XP today");
  });

  it("pins the cap with the history, and none while waiting for the history", () => {
    const dailyCap = { config: cap, xpBefore: 1200 };
    const history = new Map<string, ExerciseXpHistory>();
    expect(snapshotToPin(workout(), { history, bodyweight: { xp: 80, typed: 80 }, dailyCap })?.dailyCap).toEqual(
      dailyCap,
    );
    // Ticked offline before any history arrived: pinned without the cap.
    const w = fill(workout(), 0, 0, "60", "5", 5);
    expect(snapshotToPin(w, { history: undefined, bodyweight: { xp: 80, typed: 80 }, dailyCap })?.dailyCap).toBeNull();
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
    expect(setXpNote({ ...base, xp: 0, tag: "check_set", flagReason: "weight_above_range", isFlagged: true })).toEqual({
      text: "0 XP · Check this set",
      tone: "danger",
    });
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
    expect(
      lastSessionText(
        [8, 8, 7, 8].map((reps) => ({ reps, weightKg: 60 })),
        benchPress,
        "kg",
      ),
    ).toBe("60 kg × 8, 8, 7, 8");
    expect(
      lastSessionText(
        [
          { reps: 8, weightKg: 60 },
          { reps: 6, weightKg: 62.5 },
        ],
        benchPress,
        "kg",
      ),
    ).toBe("60 × 8, 62.5 × 6");
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
    const newestFirst = [
      session(30, 76),
      session(23, 73),
      session(16, null),
      session(9, 73),
      session(5, 72),
      session(3, 70),
      session(1, 69),
    ];

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
