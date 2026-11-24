import { BODY_PARTS, type BodyPart } from "@levelup/shared";
import {
  avatarShape,
  FRONT_LOAD,
  growth,
  HEAD,
  ZERO_DEVELOPMENT,
  type AvatarShape,
  type Development,
} from "./avatar-shape";

/** Every size a part owns (its muscles' widths and radii), so tests can tell which part changed. */
function sizes(shape: AvatarShape): Record<BodyPart, number[]> {
  const torso = shape.torso.kind === "shape" ? shape.torso : null;
  return {
    chest: [torso?.pecDepth ?? 0],
    back: [torso?.shoulderHalf ?? 0],
    core: [torso?.waistHalf ?? 0],
    shoulders: shape.deltoids.map((d) => d.r),
    arms: shape.arms.flatMap((a) => a.muscles.map((m) => m.halfWidth)),
    legs: shape.legs.flatMap((l) => l.muscles.map((m) => m.halfWidth)),
  };
}

const withPart = (part: BodyPart, value: number, base: Development = ZERO_DEVELOPMENT): Development => ({
  ...base,
  [part]: value,
});

/** A deterministic pseudo-random development (no Math.random, so failures reproduce). */
function randomDevelopment(seed: number): Development {
  let s = seed;
  const next = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  return Object.fromEntries(BODY_PARTS.map((p) => [p, next()])) as Development;
}

describe("avatarShape at development 0", () => {
  const shape = avatarShape(ZERO_DEVELOPMENT);

  it("is lines only: a stick torso, bare limbs, no deltoids", () => {
    expect(shape.torso.kind).toBe("line");
    expect(shape.arms.every((a) => a.muscles.length === 0)).toBe(true);
    expect(shape.legs.every((l) => l.muscles.length === 0)).toBe(true);
    expect(shape.deltoids).toEqual([]);
  });

  it.each(BODY_PARTS)("%s at 0 next to a developed body is still a line (core: a narrow waist)", (part) => {
    const others = Object.fromEntries(BODY_PARTS.map((p) => [p, p === part ? 0 : 0.8])) as Development;
    const shape = avatarShape(others);
    const own = sizes(shape)[part];
    if (part === "core") {
      // Core is the one exception: at 0 it's a normal narrow waist, not a point.
      const narrow = avatarShape(withPart("chest", 0.5)).torso; // core 0 on a body with only a chest
      expect(narrow.kind).toBe("shape");
      expect(own[0]).toBeGreaterThan(0);
      expect(own[0]).toBe(narrow.kind === "shape" ? narrow.waistHalf : undefined);
      expect(sizes(avatarShape(withPart("core", 0.01, others))).core[0]).toBeGreaterThan(own[0]!);
    } else if (part === "chest") {
      expect(own).toEqual([0]); // no pec line
    } else if (part === "back") {
      expect(shape.torso.kind).toBe("shape"); // chest and core still make a torso
    } else {
      expect(own).toEqual([]);
    }
  });
});

describe("avatarShape growth", () => {
  it.each(BODY_PARTS)("raising %s changes only its own sizes", (part) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const base = randomDevelopment(seed);
      const before = sizes(avatarShape(withPart(part, 0.2, base)));
      const after = sizes(avatarShape(withPart(part, 0.9, base)));
      for (const other of BODY_PARTS.filter((p) => p !== part)) expect(after[other]).toEqual(before[other]);
      expect(after[part]).not.toEqual(before[part]);
    }
  });

  it.each(BODY_PARTS)("%s's sizes never shrink as its development rises", (part) => {
    for (const seed of [11, 12, 13]) {
      const base = randomDevelopment(seed);
      let previous = sizes(avatarShape(withPart(part, 0.01, base)))[part];
      for (let d = 0.02; d <= 1.0001; d += 0.01) {
        const current = sizes(avatarShape(withPart(part, d, base)))[part];
        current.forEach((value, i) => expect(value).toBeGreaterThanOrEqual(previous[i]!));
        previous = current;
      }
    }
  });

  it("the head is the same at every development and lean", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(avatarShape(randomDevelopment(seed), seed % 2).head).toEqual(HEAD);
    }
    expect(avatarShape(ZERO_DEVELOPMENT).head).toEqual(HEAD);
  });

  it("clamps values outside 0 to 1", () => {
    const over = Object.fromEntries(BODY_PARTS.map((p) => [p, 7])) as Development;
    const under = Object.fromEntries(BODY_PARTS.map((p) => [p, -1])) as Development;
    expect(avatarShape(over)).toEqual(avatarShape(Object.fromEntries(BODY_PARTS.map((p) => [p, 1])) as Development));
    expect(avatarShape(under)).toEqual(avatarShape(ZERO_DEVELOPMENT));
  });
});

describe("lean (reserved for the endurance look)", () => {
  it("is accepted, and 0 draws exactly the default figure", () => {
    const d = randomDevelopment(42);
    expect(avatarShape(d, 0)).toEqual(avatarShape(d));
  });

  it("draws nothing yet: any lean gives today's figure (update this when the endurance look exists)", () => {
    const d = randomDevelopment(43);
    expect(avatarShape(d, 1)).toEqual(avatarShape(d, 0));
  });
});

describe("growth: the front-loaded size mapping", () => {
  it("is 0 at 0 and 1 at 1", () => {
    expect(growth(0)).toBe(0);
    expect(growth(1)).toBe(1);
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

  it("keeps 0 as lines only: any development above 0 draws a muscle, 0 draws none", () => {
    expect(avatarShape(withPart("arms", 0)).arms[0].muscles).toEqual([]);
    expect(avatarShape(withPart("arms", 0.001)).arms[0].muscles).toHaveLength(2);
  });
});
