import { createActiveWorkoutStore } from "@/stores/active-workout-store";
import { createOutboxStore } from "@/stores/outbox-store";
import { benchPress, lateralRaise, memoryStorage, plank, pullUp, sequentialIds, testUuid } from "@/test/fixtures";
import { addExercise, addSet, buildFinishPayload, startWorkout, toggleSetDone, updateSet, type ActiveWorkout } from "./active-workout";
import { finishActiveWorkout } from "./finish-workout";
import { loggingConvention } from "./logging-conventions";

const START = new Date("2026-11-10T06:00:00.000Z");
const minutesLater = (m: number) => new Date(START.getTime() + m * 60_000);

/** A store with in-memory storage, a controllable clock and predictable ids. */
function setup(storage = memoryStorage()) {
  let now = START;
  const store = createActiveWorkoutStore({ storage, newId: sequentialIds(), now: () => now });
  return { store, storage, setNow: (date: Date) => (now = date) };
}

function onlySet(workout: ActiveWorkout, exerciseIndex = 0) {
  const exercise = workout.exercises[exerciseIndex]!;
  return { exerciseKey: exercise.id, setKey: exercise.sets.at(-1)!.id };
}

describe("active workout", () => {
  it("starts with a clientId generated at the START, not at Finish", () => {
    const { store } = setup();

    store.getState().start("user-1");

    expect(store.getState().workout).toMatchObject({ userId: "user-1", clientId: testUuid(1), startedAt: START.toISOString() });
  });

  it("doesn't replace an unfinished workout when Start is tapped again", () => {
    const { store } = setup();
    store.getState().start("user-1");
    store.getState().addExercise(benchPress);

    store.getState().start("user-1");

    expect(store.getState().workout?.exercises).toHaveLength(1);
  });

  it("survives the app being killed: a new store on the same storage resumes it", () => {
    const storage = memoryStorage();
    const before = setup(storage).store;
    before.getState().start("user-1");
    before.getState().addExercise(benchPress);
    const { exerciseKey, setKey } = onlySet(before.getState().workout!);
    before.getState().updateSet(exerciseKey, setKey, { weightKg: "62,5", reps: "8" });

    const afterRestart = setup(storage).store;

    expect(afterRestart.getState().workout).toEqual(before.getState().workout);
  });

  it("pre-fills a new set from the previous one", () => {
    let w = addExercise(startWorkout({ userId: "u", clientId: "c", now: START }), benchPress, sequentialIds());
    const { exerciseKey, setKey } = onlySet(w);
    w = updateSet(w, exerciseKey, setKey, { weightKg: "60", reps: "10" });

    w = addSet(w, exerciseKey, sequentialIds());

    expect(w.exercises[0]!.sets.map((s) => [s.weightKg, s.reps, s.doneAt])).toEqual([
      ["60", "10", null],
      ["60", "10", null],
    ]);
  });

  describe("ticking a set done", () => {
    it.each([
      ["empty reps", { reps: "", weightKg: "60" }, "Reps must be a whole number from 1 to 100."],
      ["0 reps", { reps: "0", weightKg: "60" }, "Reps must be a whole number from 1 to 100."],
      ["101 reps", { reps: "101", weightKg: "60" }, "Reps must be a whole number from 1 to 100."],
      ["fractional reps", { reps: "7.5", weightKg: "60" }, "Reps must be a whole number from 1 to 100."],
      ["negative kg", { reps: "8", weightKg: "-5" }, "Weight must be from 0 to 500 kg."],
      ["text as kg", { reps: "8", weightKg: "heavy" }, "Weight must be from 0 to 500 kg."],
    ])("refuses %s", (_case, values, message) => {
      const { store } = setup();
      store.getState().start("u");
      store.getState().addExercise(benchPress);
      const { exerciseKey, setKey } = onlySet(store.getState().workout!);
      store.getState().updateSet(exerciseKey, setKey, values);

      expect(store.getState().toggleSetDone(exerciseKey, setKey)).toBe(message);
      expect(store.getState().workout!.exercises[0]!.sets[0]!.doneAt).toBeNull();
    });

    it("says 'Seconds' for a timed exercise like plank", () => {
      let w = addExercise(startWorkout({ userId: "u", clientId: "c", now: START }), plank, sequentialIds());
      const { exerciseKey, setKey } = onlySet(w);
      w = updateSet(w, exerciseKey, setKey, { reps: "" });

      const result = toggleSetDone(w, exerciseKey, setKey, START);

      expect(result).toEqual({ ok: false, message: "Seconds must be a whole number from 1 to 100." });
    });

    it("accepts empty kg as bodyweight (0) and a comma as the decimal point", () => {
      const { store, setNow } = setup();
      store.getState().start("u");
      store.getState().addExercise(pullUp);
      const first = onlySet(store.getState().workout!);
      store.getState().updateSet(first.exerciseKey, first.setKey, { reps: "10" });
      setNow(minutesLater(5));

      expect(store.getState().toggleSetDone(first.exerciseKey, first.setKey)).toBeNull();
      expect(store.getState().workout!.exercises[0]!.sets[0]!.doneAt).toBe(minutesLater(5).toISOString());
    });

    it("unticks a done set", () => {
      const { store } = setup();
      store.getState().start("u");
      store.getState().addExercise(benchPress);
      const { exerciseKey, setKey } = onlySet(store.getState().workout!);
      store.getState().updateSet(exerciseKey, setKey, { weightKg: "60", reps: "8" });
      store.getState().toggleSetDone(exerciseKey, setKey);

      store.getState().toggleSetDone(exerciseKey, setKey);

      expect(store.getState().workout!.exercises[0]!.sets[0]!.doneAt).toBeNull();
    });
  });
});

describe("buildFinishPayload", () => {
  /** Bench: set 1 done (60 x 8), set 2 not done. Lateral raise: nothing done. */
  function partlyDoneWorkout(doneAt = minutesLater(10)) {
    const ids = sequentialIds();
    let w = startWorkout({ userId: "u", clientId: "4f6c8f52-6a5e-4d8e-9a43-2d5a3c1b7e10", now: START });
    w = addExercise(w, benchPress, ids);
    const bench = onlySet(w);
    w = updateSet(w, bench.exerciseKey, bench.setKey, { weightKg: "62,5", reps: "8" });
    const ticked = toggleSetDone(w, bench.exerciseKey, bench.setKey, doneAt);
    if (!ticked.ok) throw new Error(ticked.message);
    w = addSet(ticked.value, bench.exerciseKey, ids); // copied values, NOT done
    w = addExercise(w, lateralRaise, ids);
    return w;
  }

  it("sends only completed sets, and only exercises that have one", () => {
    const result = buildFinishPayload(partlyDoneWorkout(), minutesLater(30));

    expect(result).toEqual({
      ok: true,
      value: {
        clientId: "4f6c8f52-6a5e-4d8e-9a43-2d5a3c1b7e10",
        startedAt: START.toISOString(),
        finishedAt: minutesLater(30).toISOString(),
        exercises: [
          { exerciseId: benchPress.id, sets: [{ reps: 8, weightKg: 62.5, completedAt: minutesLater(10).toISOString() }] },
        ],
      },
    });
  });

  it("blocks Finish when no set is completed", () => {
    let w = startWorkout({ userId: "u", clientId: "4f6c8f52-6a5e-4d8e-9a43-2d5a3c1b7e10", now: START });
    w = addExercise(w, benchPress, sequentialIds());

    expect(buildFinishPayload(w, minutesLater(30))).toEqual({
      ok: false,
      message: "Complete at least one set before finishing.",
    });
  });

  it("includes a trimmed name, and leaves out a blank one", () => {
    const named = { ...partlyDoneWorkout(), name: "  Push day " };
    const blank = { ...partlyDoneWorkout(), name: "   " };

    expect(buildFinishPayload(named, minutesLater(30))).toMatchObject({ ok: true, value: { name: "Push day" } });
    const blankResult = buildFinishPayload(blank, minutesLater(30));
    expect(blankResult.ok && "name" in blankResult.value).toBe(false);
  });

  it("ends a workout left open overnight at its last completed set, not next morning", () => {
    const nextMorning = minutesLater(14 * 60);

    const result = buildFinishPayload(partlyDoneWorkout(minutesLater(55)), nextMorning);

    expect(result).toMatchObject({ ok: true, value: { finishedAt: minutesLater(55).toISOString() } });
  });
});

describe("finishActiveWorkout", () => {
  it("moves the workout into the outbox and clears it", () => {
    const { store, setNow } = setup();
    const outbox = createOutboxStore(memoryStorage());
    store.getState().start("user-1");
    store.getState().addExercise(benchPress);
    const { exerciseKey, setKey } = onlySet(store.getState().workout!);
    store.getState().updateSet(exerciseKey, setKey, { weightKg: "60", reps: "8" });
    store.getState().toggleSetDone(exerciseKey, setKey);
    setNow(minutesLater(40));

    const result = finishActiveWorkout({ activeWorkout: store, outbox, now: minutesLater(40) });

    expect(result).toEqual({ ok: true, value: { clientId: testUuid(1) } });
    expect(store.getState().workout).toBeNull();
    expect(outbox.getState().items).toEqual([
      expect.objectContaining({ clientId: testUuid(1), userId: "user-1", status: "pending", attempts: 0 }),
    ]);
  });

  it("leaves everything as it was when Finish is blocked", () => {
    const { store } = setup();
    const outbox = createOutboxStore(memoryStorage());
    store.getState().start("user-1");

    const result = finishActiveWorkout({ activeWorkout: store, outbox, now: minutesLater(40) });

    expect(result.ok).toBe(false);
    expect(store.getState().workout).not.toBeNull();
    expect(outbox.getState().items).toEqual([]);
  });
});

describe("loggingConvention", () => {
  it.each([
    [benchPress, { repsLabel: "REPS", hint: null }],
    [lateralRaise, { repsLabel: "REPS", hint: "kg per dumbbell" }],
    [pullUp, { repsLabel: "REPS", hint: "Added kg only · 0 = bodyweight" }],
    [plank, { repsLabel: "SEC", hint: "Log seconds held · Added kg only · 0 = bodyweight" }],
  ])("labels $name correctly", (exercise, expected) => {
    expect(loggingConvention(exercise)).toEqual(expected);
  });
});
