import { BODY_PARTS } from "@levelup/shared";
import { avatarShape, ZERO_DEVELOPMENT, type Development } from "./avatar-shape";
import { drawnDevelopment, FRONT_LOAD, growth } from "./avatar-growth";

describe("growth: the front-loaded size mapping", () => {
  it("is 0 at 0 and 1 at 1, clamped outside", () => {
    expect(growth(0)).toBe(0);
    expect(growth(1)).toBe(1);
    expect(growth(-0.5)).toBe(0);
    expect(growth(3)).toBe(1);
  });

  it("is monotonic", () => {
    let previous = growth(0);
    for (let d = 0.001; d <= 1; d += 0.001) {
      const g = growth(d);
      expect(g).toBeGreaterThan(previous);
      previous = g;
    }
  });

  it("front-loads: the first quarter of development draws well over a quarter of the size", () => {
    expect(FRONT_LOAD).toBeLessThan(1);
    expect(growth(0.25)).toBeCloseTo(0.25 ** FRONT_LOAD, 10);
    expect(growth(0.25)).toBeGreaterThan(0.4);
  });
});

describe("drawnDevelopment: the step the Avatar component applies before the renderer", () => {
  it("maps every part through growth, each on its own", () => {
    const d: Development = { chest: 0.25, back: 0, shoulders: 0.5, arms: 1, core: 0.04, legs: 0.81 };
    const drawn = drawnDevelopment(d);
    for (const part of BODY_PARTS) expect(drawn[part]).toBe(growth(d[part]));
  });

  it("keeps 0 at 0, so an untrained part is still lines only after it", () => {
    expect(drawnDevelopment(ZERO_DEVELOPMENT)).toEqual(ZERO_DEVELOPMENT);
    expect(avatarShape(drawnDevelopment(ZERO_DEVELOPMENT))).toEqual(avatarShape(ZERO_DEVELOPMENT));
    const tiny = drawnDevelopment({ ...ZERO_DEVELOPMENT, arms: 0.001 });
    expect(avatarShape(tiny).arms[0].muscles).toHaveLength(2);
  });

  it("is front-loaded in the drawing: development 0.25 draws a muscle well past a quarter of the way to its maximum", () => {
    const peak = (d: number) => avatarShape({ ...ZERO_DEVELOPMENT, arms: d }).arms[0].muscles[0]!.halfWidth;
    const share = (d: number) => (peak(d) - peak(0.000001)) / (peak(1) - peak(0.000001));
    // avatarShape is linear in what it is given ...
    expect(share(0.25)).toBeCloseTo(0.25, 2);
    // ... and the front-loading comes from this step.
    expect(share(drawnDevelopment({ ...ZERO_DEVELOPMENT, arms: 0.25 }).arms)).toBeGreaterThan(0.4);
  });
});
