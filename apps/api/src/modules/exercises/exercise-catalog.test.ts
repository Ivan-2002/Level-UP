import { SIM_EXERCISES } from "@levelup/shared/simulation";
import { describe, expect, it } from "vitest";
import { EXERCISE_CATALOG } from "./exercise-catalog.js";

// The balancing simulation (packages/shared/simulation) keeps its own copy of the XP
// tuning, because shared can't import from the API. This keeps the copy honest: retune
// an exercise here and this test asks you to update the simulation too.
describe("the balancing simulation's exercise tuning", () => {
  it.each(Object.entries(SIM_EXERCISES))("matches the catalog for %s", (slug, sim) => {
    const entry = EXERCISE_CATALOG.find((e) => e.slug === slug);

    expect(entry, `${slug} is not in the catalog`).toBeDefined();
    expect({
      loadFactor: Number(entry!.loadFactor),
      bodyweightRatio: Number(entry!.bodyweightRatio ?? 0),
      repsUnit: entry!.repsUnit ?? "reps",
    }).toEqual(sim);
  });
});
