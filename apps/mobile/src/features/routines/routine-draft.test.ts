import type { Routine } from "@levelup/shared";
import { benchPress, plank, pullUp, sequentialIds } from "@/test/fixtures";
import {
  addExercises,
  draftFromRoutine,
  emptyDraft,
  hasChanges,
  inheritedRestSec,
  moveExercise,
  removeExercise,
  rename,
  resetRest,
  stepRest,
  stepTarget,
  toRoutineInput,
} from "./routine-draft";

const keys = () => {
  let n = 0;
  return () => `k${++n}`;
};

function pushDay() {
  return addExercises(rename(emptyDraft(), "Push day"), [benchPress, pullUp, plank], keys());
}

describe("adding exercises", () => {
  it("adds them in the order picked, with 3 x 8 (or 3 x 30 s for timed ones) and no routine rest", () => {
    expect(pushDay().exercises.map((e) => [e.key, e.exercise.name, e.targetSets, e.targetReps, e.restSec])).toEqual([
      ["k1", "Bench Press", 3, 8, null],
      ["k2", "Pull-up", 3, 8, null],
      ["k3", "Plank", 3, 30, null],
    ]);
  });

  it("allows the same exercise twice (e.g. a top set and back-off sets)", () => {
    const draft = addExercises(emptyDraft(), [benchPress, benchPress], keys());
    expect(draft.exercises.map((e) => e.key)).toEqual(["k1", "k2"]);
  });
});

describe("reordering and removing", () => {
  it("moves an exercise one place, and does nothing at the ends", () => {
    const draft = pushDay();
    const names = (d: typeof draft) => d.exercises.map((e) => e.exercise.name);

    expect(names(moveExercise(draft, "k3", -1))).toEqual(["Bench Press", "Plank", "Pull-up"]);
    expect(moveExercise(draft, "k1", -1)).toBe(draft);
    expect(moveExercise(draft, "k3", 1)).toBe(draft);
  });

  it("removes by key", () => {
    expect(removeExercise(pushDay(), "k2").exercises.map((e) => e.key)).toEqual(["k1", "k3"]);
  });
});

describe("targets", () => {
  it("steps sets between 1 and 10", () => {
    let draft = pushDay();
    for (let i = 0; i < 12; i++) draft = stepTarget(draft, "k1", "targetSets", 1);
    expect(draft.exercises[0]!.targetSets).toBe(10);
    for (let i = 0; i < 12; i++) draft = stepTarget(draft, "k1", "targetSets", -1);
    expect(draft.exercises[0]!.targetSets).toBe(1);
  });

  it("steps reps by 1, and a timed exercise by 5 seconds", () => {
    const draft = stepTarget(stepTarget(pushDay(), "k1", "targetReps", 1), "k3", "targetReps", 1);
    expect([draft.exercises[0]!.targetReps, draft.exercises[2]!.targetReps]).toEqual([9, 35]);
  });
});

describe("rest", () => {
  it("inherits the player's own choice over the exercise's suggestion", () => {
    expect(inheritedRestSec(benchPress)).toBe(180);
    expect(inheritedRestSec({ ...benchPress, restPreferenceSec: 90 })).toBe(90);
  });

  it("starts stepping from the inherited time, in 15 s steps, within 15 s - 10 min", () => {
    let draft = stepRest(pushDay(), "k1", -1);
    expect(draft.exercises[0]!.restSec).toBe(165); // from bench press's 3:00 suggestion

    for (let i = 0; i < 50; i++) draft = stepRest(draft, "k1", 1);
    expect(draft.exercises[0]!.restSec).toBe(600);
  });

  it("can go back to inheriting", () => {
    expect(resetRest(stepRest(pushDay(), "k1", 1), "k1").exercises[0]!.restSec).toBeNull();
  });
});

describe("saving", () => {
  it("builds the API body with the server's own schema", () => {
    const result = toRoutineInput(stepRest(pushDay(), "k1", 1));
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Push day",
        exercises: [
          { exerciseId: benchPress.id, targetSets: 3, targetReps: 8, restSec: 195 },
          { exerciseId: pullUp.id, targetSets: 3, targetReps: 8, restSec: null },
          { exerciseId: plank.id, targetSets: 3, targetReps: 30, restSec: null },
        ],
      },
    });
  });

  it("explains what's missing", () => {
    expect(toRoutineInput(addExercises(emptyDraft(), [benchPress], keys()))).toEqual({ ok: false, message: "Give the routine a name." });
    expect(toRoutineInput(rename(emptyDraft(), "Legs"))).toEqual({ ok: false, message: "Add at least one exercise." });
  });
});

describe("unsaved changes", () => {
  const routine: Routine = {
    id: "00000000-0000-4000-8000-000000000099",
    name: "Push day",
    lastDoneAt: null,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    exercises: [{ id: "00000000-0000-4000-8000-000000000098", order: 1, exercise: benchPress, targetSets: 3, targetReps: 8, restSec: null }],
  };

  it("ignores local keys and spaces around the name", () => {
    const original = draftFromRoutine(routine, sequentialIds());
    const reopened = rename(draftFromRoutine(routine, keys()), " Push day ");
    expect(hasChanges(reopened, original)).toBe(false);
  });

  it("notices a real change", () => {
    const original = draftFromRoutine(routine, keys());
    expect(hasChanges(stepTarget(original, original.exercises[0]!.key, "targetSets", 1), original)).toBe(true);
  });
});
