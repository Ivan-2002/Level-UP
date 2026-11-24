import { benchPress, lateralRaise, plank, pullUp } from "@/test/fixtures";
import { addButtonLabel, groupExercises, initials, toggleSelected } from "./exercise-selection";

describe("toggleSelected", () => {
  it("keeps the order you tapped, and taps again to deselect", () => {
    let selected = toggleSelected([], "pull-up");
    selected = toggleSelected(selected, "bench");
    selected = toggleSelected(selected, "plank");
    expect(toggleSelected(selected, "bench")).toEqual(["pull-up", "plank"]);
  });
});

describe("addButtonLabel", () => {
  it("asks you to select first, then counts", () => {
    expect([0, 1, 2].map(addButtonLabel)).toEqual(["Select exercises", "Add 1 exercise", "Add 2 exercises"]);
  });
});

describe("groupExercises", () => {
  const library = [benchPress, pullUp, plank, lateralRaise];
  const recent = [{ exercise: pullUp, lastDoneAt: "2026-11-10T10:00:00.000Z", lastSets: [{ reps: 9, weightKg: 0 }] }];

  it("lists recently used first and doesn't repeat them", () => {
    const groups = groupExercises({ library, recent, search: "", bodyPart: null });
    expect(groups.recent.map((r) => r.exercise.name)).toEqual(["Pull-up"]);
    expect(groups.all.map((e) => e.name)).toEqual(["Bench Press", "Plank", "Lateral Raise"]);
  });

  it("applies the search and muscle-group filter to both", () => {
    expect(groupExercises({ library, recent, search: "bench", bodyPart: null })).toEqual({
      recent: [],
      all: [benchPress],
    });
    expect(groupExercises({ library, recent, search: "", bodyPart: "back" }).recent).toHaveLength(1);
  });
});

describe("initials", () => {
  it.each([
    ["Bench Press", "BP"],
    ["Pull-up", "PU"],
    ["Plank", "PL"],
    ["Romanian Deadlift Variation", "RD"],
  ])("%s -> %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
