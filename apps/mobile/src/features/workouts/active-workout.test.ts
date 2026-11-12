import type { Routine } from "@levelup/shared";
import { createActiveWorkoutStore } from "@/stores/active-workout-store";
import { createOutboxStore } from "@/stores/outbox-store";
import { benchPress, lateralRaise, memoryStorage, plank, pullUp, sequentialIds, testUuid } from "@/test/fixtures";
import {
  addExercise,
  addSet,
  buildFinishPayload,
  currentExercise,
  lastSetsFrom,
  migrateV1,
  removeExercise,
  startWorkout,
  stepRest,
  toggleSetDone,
  updateSet,
  type ActiveWorkout,
} from "./active-workout";
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

    store.getState().start("user-1", "kg");

    expect(store.getState().workout).toMatchObject({ userId: "user-1", clientId: testUuid(1), startedAt: START.toISOString() });
  });

  it("doesn't replace an unfinished workout when Start is tapped again", () => {
    const { store } = setup();
    store.getState().start("user-1", "kg");
    store.getState().addExercises([benchPress]);

    store.getState().start("user-1", "kg");

    expect(store.getState().workout?.exercises).toHaveLength(1);
  });

  it("survives the app being killed: a new store on the same storage resumes it", () => {
    const storage = memoryStorage();
    const before = setup(storage).store;
    before.getState().start("user-1", "kg");
    before.getState().addExercises([benchPress]);
    const { exerciseKey, setKey } = onlySet(before.getState().workout!);
    before.getState().updateSet(exerciseKey, setKey, { weight: "62,5", reps: "8" });

    const afterRestart = setup(storage).store;

    expect(afterRestart.getState().workout).toEqual(before.getState().workout);
  });

  it("pre-fills a new set from the previous one", () => {
    let w = addExercise(startWorkout({ userId: "u", clientId: "c", now: START, weightUnit: "kg" }), benchPress, sequentialIds());
    const { exerciseKey, setKey } = onlySet(w);
    w = updateSet(w, exerciseKey, setKey, { weight: "60", reps: "10" });

    w = addSet(w, exerciseKey, sequentialIds());

    expect(w.exercises[0]!.sets.map((s) => [s.weight, s.reps, s.doneAt])).toEqual([
      ["60", "10", null],
      ["60", "10", null],
    ]);
  });

  describe("ticking a set done", () => {
    it.each([
      ["empty reps", { reps: "", weight: "60" }, "Reps must be a whole number from 1 to 100."],
      ["0 reps", { reps: "0", weight: "60" }, "Reps must be a whole number from 1 to 100."],
      ["101 reps", { reps: "101", weight: "60" }, "Reps must be a whole number from 1 to 100."],
      ["fractional reps", { reps: "7.5", weight: "60" }, "Reps must be a whole number from 1 to 100."],
      ["negative weight", { reps: "8", weight: "-5" }, "Weight must be from 0 to 500 kg."],
      ["text as weight", { reps: "8", weight: "heavy" }, "Weight must be from 0 to 500 kg."],
    ])("refuses %s", (_case, values, message) => {
      const { store } = setup();
      store.getState().start("u", "kg");
      store.getState().addExercises([benchPress]);
      const { exerciseKey, setKey } = onlySet(store.getState().workout!);
      store.getState().updateSet(exerciseKey, setKey, values);

      expect(store.getState().toggleSetDone(exerciseKey, setKey)).toBe(message);
      expect(store.getState().workout!.exercises[0]!.sets[0]!.doneAt).toBeNull();
    });

    it("says 'Seconds' for a timed exercise like plank", () => {
      let w = addExercise(startWorkout({ userId: "u", clientId: "c", now: START, weightUnit: "kg" }), plank, sequentialIds());
      const { exerciseKey, setKey } = onlySet(w);
      w = updateSet(w, exerciseKey, setKey, { reps: "" });

      const result = toggleSetDone(w, exerciseKey, setKey, START);

      expect(result).toEqual({ ok: false, message: "Seconds must be a whole number from 1 to 100." });
    });

    it("accepts empty kg as bodyweight (0) and a comma as the decimal point", () => {
      const { store, setNow } = setup();
      store.getState().start("u", "kg");
      store.getState().addExercises([pullUp]);
      const first = onlySet(store.getState().workout!);
      store.getState().updateSet(first.exerciseKey, first.setKey, { reps: "10" });
      setNow(minutesLater(5));

      expect(store.getState().toggleSetDone(first.exerciseKey, first.setKey)).toBeNull();
      expect(store.getState().workout!.exercises[0]!.sets[0]!.doneAt).toBe(minutesLater(5).toISOString());
    });

    it("unticks a done set", () => {
      const { store } = setup();
      store.getState().start("u", "kg");
      store.getState().addExercises([benchPress]);
      const { exerciseKey, setKey } = onlySet(store.getState().workout!);
      store.getState().updateSet(exerciseKey, setKey, { weight: "60", reps: "8" });
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
    let w = startWorkout({ userId: "u", clientId: "4f6c8f52-6a5e-4d8e-9a43-2d5a3c1b7e10", now: START, weightUnit: "kg" });
    w = addExercise(w, benchPress, ids);
    const bench = onlySet(w);
    w = updateSet(w, bench.exerciseKey, bench.setKey, { weight: "62,5", reps: "8" });
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
          { exerciseId: benchPress.id, restSec: 180, sets: [{ reps: 8, weightKg: 62.5, completedAt: minutesLater(10).toISOString() }] },
        ],
      },
    });
  });

  it("blocks Finish when no set is completed", () => {
    let w = startWorkout({ userId: "u", clientId: "4f6c8f52-6a5e-4d8e-9a43-2d5a3c1b7e10", now: START, weightUnit: "kg" });
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
    store.getState().start("user-1", "kg");
    store.getState().addExercises([benchPress]);
    const { exerciseKey, setKey } = onlySet(store.getState().workout!);
    store.getState().updateSet(exerciseKey, setKey, { weight: "60", reps: "8" });
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
    store.getState().start("user-1", "kg");

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

  it("names the player's unit", () => {
    expect(loggingConvention(lateralRaise, "lb").hint).toBe("lb per dumbbell");
  });
});

describe("starting from a routine", () => {
  const routine: Routine = {
    id: testUuid(900),
    name: "Push day",
    lastDoneAt: null,
    createdAt: START.toISOString(),
    updatedAt: START.toISOString(),
    exercises: [
      { id: testUuid(901), order: 1, exercise: benchPress, targetSets: 3, targetReps: 8, restSec: null },
      { id: testUuid(902), order: 2, exercise: pullUp, targetSets: 2, targetReps: 10, restSec: 120 },
    ],
  };
  // Last time: bench 3 x 8 at 62.5 kg (every set hit the target, so the coach adds 2.5 kg).
  const lastSets = lastSetsFrom({
    items: [
      {
        exerciseId: benchPress.id,
        session: {
          workoutId: testUuid(800),
          startedAt: START.toISOString(),
          bodyweightKg: 80,
          sets: [8, 8, 8].map((reps) => ({ reps, weightKg: 62.5 })),
          bestE1rm: 79,
          volumeKg: 1500,
          topSet: { reps: 8, weightKg: 62.5 },
        },
      },
    ],
  });

  it("copies the plan: name, exercises in order, planned sets, pre-filled by the coach", () => {
    const { store } = setup();

    store.getState().startFromRoutine("user-1", "kg", routine, lastSets);

    const workout = store.getState().workout!;
    expect(workout).toMatchObject({ name: "Push day", routineId: routine.id, clientId: testUuid(1), currentExerciseKey: workout.exercises[0]!.id });
    expect(workout.exercises.map((e) => [e.exercise.name, e.sets.map((s) => [s.weight, s.reps, s.doneAt])])).toEqual([
      ["Bench Press", [["65", "8", null], ["65", "8", null], ["65", "8", null]]], // 62.5 + 2.5
      ["Pull-up", [["", "10", null], ["", "10", null]]], // never done: weight left to fill in
    ]);
  });

  it("links the finished workout to its routine", () => {
    const { store } = setup();
    store.getState().startFromRoutine("user-1", "kg", routine, lastSets);
    const { exerciseKey, setKey } = { exerciseKey: store.getState().workout!.exercises[0]!.id, setKey: store.getState().workout!.exercises[0]!.sets[0]!.id };
    store.getState().toggleSetDone(exerciseKey, setKey);

    const payload = buildFinishPayload(store.getState().workout!, minutesLater(30));

    expect(payload).toMatchObject({ ok: true, value: { routineId: routine.id, name: "Push day" } });
  });

  it("never replaces a workout already in progress", () => {
    const { store } = setup();
    store.getState().start("user-1", "kg");

    store.getState().startFromRoutine("user-1", "kg", routine);

    expect(store.getState().workout).toMatchObject({ name: "", exercises: [] });
  });

  it("adds several exercises at once, in the order picked", () => {
    const { store } = setup();
    store.getState().start("user-1", "kg");

    store.getState().addExercises([plank, lateralRaise]);

    expect(store.getState().workout!.exercises.map((e) => e.exercise.name)).toEqual(["Plank", "Lateral Raise"]);
  });
});

describe("weights in the player's unit", () => {
  it("types pounds and sends kilograms", () => {
    const ids = sequentialIds();
    let w = addExercise(startWorkout({ userId: "u", clientId: "4f6c8f52-6a5e-4d8e-9a43-2d5a3c1b7e10", now: START, weightUnit: "lb" }), benchPress, ids);
    const { exerciseKey, setKey } = onlySet(w);
    w = updateSet(w, exerciseKey, setKey, { weight: "135", reps: "5" });
    const ticked = toggleSetDone(w, exerciseKey, setKey, minutesLater(5));
    if (!ticked.ok) throw new Error(ticked.message);

    const result = buildFinishPayload(ticked.value, minutesLater(30));

    expect(result.ok && result.value.exercises[0]!.sets[0]!.weightKg).toBe(61.235);
  });

  it("states the weight limit in the player's unit", () => {
    let w = addExercise(startWorkout({ userId: "u", clientId: "c", now: START, weightUnit: "lb" }), benchPress, sequentialIds());
    const { exerciseKey, setKey } = onlySet(w);
    w = updateSet(w, exerciseKey, setKey, { weight: "1200", reps: "5" });

    expect(toggleSetDone(w, exerciseKey, setKey, START)).toEqual({ ok: false, message: "Weight must be from 0 to 1102 lb." });
  });

  it("pre-fills a lb player's next weight in pounds (135 lb -> 140 lb)", () => {
    const lastSets = new Map([[benchPress.id, [8, 8, 8].map((reps) => ({ reps, weightKg: 61.235 }))]]);
    const w = addExercise(startWorkout({ userId: "u", clientId: "c", now: START, weightUnit: "lb" }), benchPress, sequentialIds(), lastSets);

    expect(w.exercises[0]!.sets.map((s) => [s.weight, s.reps])).toEqual([["140", "8"], ["140", "8"], ["140", "8"]]);
  });
});

describe("rest per exercise", () => {
  const base = () => addExercise(startWorkout({ userId: "u", clientId: "4f6c8f52-6a5e-4d8e-9a43-2d5a3c1b7e10", now: START, weightUnit: "kg" }), benchPress, sequentialIds());

  it("starts from the player's preference, then the suggestion", () => {
    expect(base().exercises[0]!.restSec).toBe(180);
    const preferred = addExercise(startWorkout({ userId: "u", clientId: "c", now: START, weightUnit: "kg" }), { ...benchPress, restPreferenceSec: 90 }, sequentialIds());
    expect(preferred.exercises[0]!.restSec).toBe(90);
  });

  it("saves a rest the player changed as their preference on Finish", () => {
    let w = stepRest(base(), base().exercises[0]!.id, -1);
    const { exerciseKey, setKey } = onlySet(w);
    w = updateSet(w, exerciseKey, setKey, { weight: "60", reps: "8" });
    const ticked = toggleSetDone(w, exerciseKey, setKey, minutesLater(5));
    if (!ticked.ok) throw new Error(ticked.message);

    const result = buildFinishPayload(ticked.value, minutesLater(30));

    expect(result.ok && result.value.exercises[0]).toMatchObject({ restSec: 165, saveRestAsPreference: true });
  });
});

describe("the exercise on screen", () => {
  it("opens the first exercise added, and moves on when it's removed", () => {
    const ids = sequentialIds();
    let w = addExercise(startWorkout({ userId: "u", clientId: "c", now: START, weightUnit: "kg" }), benchPress, ids);
    w = addExercise(w, pullUp, ids);
    expect(currentExercise(w)!.exercise.name).toBe("Pull-up");

    w = removeExercise(w, currentExercise(w)!.id);
    expect(currentExercise(w)!.exercise.name).toBe("Bench Press");
  });
});

describe("a workout saved by the previous app version (store v1)", () => {
  it("is upgraded, not lost, when the app updates", () => {
    const storage = memoryStorage();
    storage.setItem(
      "levelup.active-workout",
      JSON.stringify({
        version: 1,
        state: {
          workout: {
            userId: "user-1",
            clientId: testUuid(1),
            startedAt: START.toISOString(),
            name: "",
            exercises: [{ id: "e1", exercise: benchPress, sets: [{ id: "s1", weightKg: "62.5", reps: "8", doneAt: minutesLater(5).toISOString() }] }],
          },
        },
      }),
    );

    const { store } = setup(storage);

    expect(store.getState().workout).toMatchObject({
      weightUnit: "kg",
      routineId: null,
      currentExerciseKey: "e1",
      exercises: [{ restSec: 180, restChanged: false, targetReps: null, sets: [{ weight: "62.5", reps: "8" }] }],
    });
    expect(migrateV1(null)).toBeNull();
  });
});
