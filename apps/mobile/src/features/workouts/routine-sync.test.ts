import type { Routine } from "@levelup/shared";
import { benchPress, lateralRaise, plank, pullUp, sequentialIds, testUuid } from "@/test/fixtures";
import { addExercise, addSet, removeExercise, removeSet, startFromRoutine, startWorkout, updateSet, type ActiveWorkout } from "./active-workout";
import { routineChanges, routineFromWorkout } from "./routine-sync";

const START = new Date("2026-11-10T06:00:00.000Z");
const routine: Routine = {
  id: testUuid(900),
  name: "Push day",
  lastDoneAt: null,
  createdAt: START.toISOString(),
  updatedAt: START.toISOString(),
  exercises: [
    { id: testUuid(901), order: 1, exercise: benchPress, targetSets: 3, targetReps: 8, restSec: 150 },
    { id: testUuid(902), order: 2, exercise: pullUp, targetSets: 2, targetReps: 10, restSec: null },
  ],
};
const names = new Map([benchPress, pullUp, plank, lateralRaise].map((e) => [e.id, e.name]));

function fromRoutine(): ActiveWorkout {
  return startFromRoutine({ userId: "u", clientId: "c", now: START, weightUnit: "kg", routine, newId: sequentialIds() });
}

describe("routineChanges", () => {
  it("is empty for an unchanged routine workout, and for an empty workout", () => {
    expect(routineChanges(fromRoutine(), names)).toEqual([]);
    expect(routineChanges(addExercise(startWorkout({ userId: "u", clientId: "c", now: START, weightUnit: "kg" }), benchPress, sequentialIds()), names)).toEqual([]);
  });

  it("lists added and removed exercises and changed set counts", () => {
    const ids = sequentialIds();
    let w = fromRoutine();
    w = addSet(w, w.exercises[0]!.id, ids); // bench: 4 sets
    w = removeExercise(w, w.exercises[1]!.id); // no pull-ups
    w = addExercise(w, lateralRaise, ids);

    expect(routineChanges(w, names)).toEqual(["Added Lateral Raise", "Removed Pull-up", "Bench Press: 4 sets (was 3)"]);
  });

  it("notices fewer sets", () => {
    const w = fromRoutine();
    expect(routineChanges(removeSet(w, w.exercises[1]!.id, w.exercises[1]!.sets[0]!.id), names)).toEqual(["Pull-up: 1 set (was 2)"]);
  });

  it("notices a new order of the same exercises", () => {
    const w = fromRoutine();
    expect(routineChanges({ ...w, exercises: [...w.exercises].reverse() }, names)).toEqual(["New exercise order"]);
  });
});

describe("routineFromWorkout", () => {
  it("keeps the plan's targets and rest, and takes set counts from the workout", () => {
    const w = fromRoutine();
    const result = routineFromWorkout(addSet(w, w.exercises[0]!.id, sequentialIds()), "Push day");

    expect(result).toEqual({
      ok: true,
      value: {
        name: "Push day",
        exercises: [
          { exerciseId: benchPress.id, targetSets: 4, targetReps: 8, restSec: 150 },
          { exerciseId: pullUp.id, targetSets: 2, targetReps: 10, restSec: null },
        ],
      },
    });
  });

  it("builds a routine from an empty workout, taking reps from what was typed", () => {
    const ids = sequentialIds();
    let w = addExercise(startWorkout({ userId: "u", clientId: "c", now: START, weightUnit: "kg" }), lateralRaise, ids);
    w = updateSet(w, w.exercises[0]!.id, w.exercises[0]!.sets[0]!.id, { reps: "12" });
    w = addSet(w, w.exercises[0]!.id, ids);
    w = addExercise(w, plank, ids); // nothing typed: 30 s default

    expect(routineFromWorkout(w, "Shoulders")).toMatchObject({
      ok: true,
      value: { exercises: [{ exerciseId: lateralRaise.id, targetSets: 2, targetReps: 12, restSec: null }, { exerciseId: plank.id, targetReps: 30 }] },
    });
  });

  it("needs a name", () => {
    expect(routineFromWorkout(fromRoutine(), " ")).toEqual({ ok: false, message: "Give the routine a name." });
  });
});
