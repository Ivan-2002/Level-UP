import { describe, expect, it } from "vitest";
import { levelFromXp, levelProgress, xpForLevel } from "./index.js";

// These numbers are the ones in docs/ARCHITECTURE.md and the screen designs.
// If someone changes the curve, these tests fail and force a deliberate decision.
describe("xpForLevel", () => {
  it("needs 0 XP for level 1", () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it("matches the documented curve", () => {
    expect(xpForLevel(2)).toBe(400);
    expect(xpForLevel(5)).toBe(7879);
    expect(xpForLevel(10)).toBe(45049);
    expect(xpForLevel(20)).toBe(224585);
  });

  it("has no maximum level", () => {
    expect(xpForLevel(50)).toBeGreaterThan(xpForLevel(49));
    expect(levelFromXp(xpForLevel(50))).toBe(50);
  });

  it("rejects invalid levels", () => {
    expect(() => xpForLevel(0)).toThrow(RangeError);
    expect(() => xpForLevel(2.5)).toThrow(RangeError);
  });
});

describe("levelFromXp", () => {
  it("starts everyone at level 1", () => {
    expect(levelFromXp(0)).toBe(1);
  });

  it("levels up exactly at the boundary, not one XP before", () => {
    expect(levelFromXp(399)).toBe(1);
    expect(levelFromXp(400)).toBe(2);
  });

  it("rejects negative XP", () => {
    expect(() => levelFromXp(-1)).toThrow(RangeError);
  });
});

describe("levelProgress", () => {
  it("works out the XP bar: 10,000 XP is level 5, about 44% of the way to level 6", () => {
    const p = levelProgress(10000);
    expect(p.level).toBe(5);
    expect(p.levelStartXp).toBe(7879);
    expect(p.nextLevelXp).toBe(12731);
    expect(p.progress).toBeCloseTo(0.437, 3);
  });

  it("is exactly 0 at the start of a level", () => {
    expect(levelProgress(7879).progress).toBe(0);
  });
});
