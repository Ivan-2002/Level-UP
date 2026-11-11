import { benchPress, lateralRaise, plank, pullUp } from "@/test/fixtures";
import { filterExercises } from "./filter-exercises";

const all = [benchPress, pullUp, plank, lateralRaise];
const names = (list: typeof all) => list.map((e) => e.name);

describe("filterExercises", () => {
  it("returns everything with no search and no body part", () => {
    expect(names(filterExercises(all, "", null))).toEqual(names(all));
  });

  it("matches the name or the muscle group, ignoring case", () => {
    expect(names(filterExercises(all, "BENCH", null))).toEqual(["Bench Press"]);
    expect(names(filterExercises(all, "lats", null))).toEqual(["Pull-up"]);
  });

  it("needs every word to match, in any order", () => {
    expect(names(filterExercises(all, "raise lateral", null))).toEqual(["Lateral Raise"]);
    expect(names(filterExercises(all, "lateral bench", null))).toEqual([]);
  });

  it("filters by body part, combined with the search", () => {
    expect(names(filterExercises(all, "", "core"))).toEqual(["Plank"]);
    expect(names(filterExercises(all, "pull", "chest"))).toEqual([]);
  });
});
