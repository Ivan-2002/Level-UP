import { describe, expect, it } from "vitest";
import { stageForLevel, type AvatarStage } from "./avatar.js";

const stage = (key: string, levelRequired: number): AvatarStage => ({ key, name: key, levelRequired });
// Out of order on purpose: the rule mustn't depend on how the rows come back.
const STAGES = [
  stage("athlete", 10),
  stage("rookie", 1),
  stage("legend", 20),
  stage("regular", 4),
  stage("champion", 15),
];

describe("stageForLevel", () => {
  it("gives each level the highest stage it has reached", () => {
    expect([1, 3, 4, 9, 10, 14, 15, 19, 20].map((level) => stageForLevel(STAGES, level)?.key)).toEqual([
      "rookie",
      "rookie",
      "regular",
      "regular",
      "athlete",
      "athlete",
      "champion",
      "champion",
      "legend",
    ]);
  });

  it("keeps the last stage beyond it: levels have no maximum", () => {
    expect(stageForLevel(STAGES, 57)?.key).toBe("legend");
  });

  it("is null when no stage starts at or below the level", () => {
    expect(stageForLevel([], 5)).toBeNull();
    expect(stageForLevel([stage("regular", 4)], 3)).toBeNull();
  });
});
