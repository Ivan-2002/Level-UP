import { describe, expect, it } from "vitest";
import { levelFromXp, levelProgress, xpForLevel } from "./index.js";

// These numbers are the ones in docs/ARCHITECTURE.md and the screen designs.
// If someone changes the curve, these tests fail and force a deliberate decision.
describe("xpForLevel", () => {
  it("needs 0 XP for level 1", () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it("matches the documented curve", () => {
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(5)).toBe(800);
    expect(xpForLevel(10)).toBe(2700);
    expect(xpForLevel(20)).toBe(8282);
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
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
  });

  it("rejects negative XP", () => {
    expect(() => levelFromXp(-1)).toThrow(RangeError);
  });
});

describe("levelProgress", () => {
  it("matches the home screen design: 1,040 XP is level 5, about 75% through", () => {
    const p = levelProgress(1040);
    expect(p.level).toBe(5);
    expect(p.levelStartXp).toBe(800);
    expect(p.nextLevelXp).toBe(1118);
    expect(p.progress).toBeCloseTo(0.755, 3);
  });

  it("is exactly 0 at the start of a level", () => {
    expect(levelProgress(800).progress).toBe(0);
  });
});
