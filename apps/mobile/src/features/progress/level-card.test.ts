import { homeLevel } from "./level-card";

const REGULAR = { key: "regular", name: "Regular", levelRequired: 4 };

describe("homeLevel", () => {
  it("shows the level, the stage and the server's progress through the level", () => {
    expect(homeLevel({ level: { level: 6, xpIntoLevel: 2140, xpForNextLevel: 6109 }, stage: REGULAR })).toEqual({
      title: "Level 6 · Regular",
      progressText: "2,140 / 6,109 XP",
      fraction: 2140 / 6109,
      accessibilityLabel: "Level 6, Regular. 2,140 of 6,109 XP to level 7.",
    });
  });

  it("leaves the stage out when the profile has none (a copy saved before stages)", () => {
    const level = homeLevel({ level: { level: 1, xpIntoLevel: 0, xpForNextLevel: 400 }, stage: null });
    expect(level.title).toBe("Level 1");
    expect(level.accessibilityLabel).toBe("Level 1. 0 of 400 XP to level 2.");
    expect(level.fraction).toBe(0);
  });
});
