import { BODY_PARTS, type BodyPart } from "@levelup/shared";
import {
  avatarShape,
  bulgeWidth,
  cropFor,
  deltoidPath,
  HEAD,
  limbPath,
  muscleEdges,
  MUSCLE_SAMPLES,
  pecPath,
  strokeFor,
  ZERO_DEVELOPMENT,
  type AvatarShape,
  type Development,
  type Muscle,
} from "./avatar-shape";

const widths = (m: Muscle) => [m.halfWidth, m.startWidth, m.endWidth, m.flatWidth];

/** Every size a part owns (its muscles' widths and radii), so tests can tell which part changed. */
function sizes(shape: AvatarShape): Record<BodyPart, number[]> {
  const torso = shape.torso.kind === "shape" ? shape.torso : null;
  return {
    chest: [torso?.pecDepth ?? 0],
    back: [torso?.shoulderHalf ?? 0],
    core: [torso?.waistHalf ?? 0],
    shoulders: shape.deltoids.map((d) => d.r),
    arms: shape.arms.flatMap((a) => a.muscles.flatMap(widths)),
    legs: shape.legs.flatMap((l) => l.muscles.flatMap(widths)),
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

  it("the head is the same at every development and stamina", () => {
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

describe("stamina (reserved for the earned endurance look)", () => {
  it("is accepted, and 0 draws exactly the default figure", () => {
    const d = randomDevelopment(42);
    expect(avatarShape(d, 0)).toEqual(avatarShape(d));
  });

  it("draws nothing yet: any stamina gives today's figure (update this when the endurance look exists)", () => {
    const d = randomDevelopment(43);
    expect(avatarShape(d, 1)).toEqual(avatarShape(d, 0));
  });
});

describe("development 0 (sizes are linear; the front-loading is avatar-growth.ts)", () => {
  it("keeps 0 as lines only: any development above 0 draws a muscle, 0 draws none", () => {
    expect(avatarShape(withPart("arms", 0)).arms[0].muscles).toEqual([]);
    expect(avatarShape(withPart("arms", 0.001)).arms[0].muscles).toHaveLength(2);
  });
});

describe("muscles bulge on one side (a cartoon muscle, not a symmetric spindle)", () => {
  const strong = avatarShape({ chest: 0.7, back: 0.7, shoulders: 0.7, arms: 0.7, core: 0.5, legs: 0.7 });
  const all = [...strong.arms, ...strong.legs].flatMap((l, i) =>
    l.muscles.map((m) => ({ m, bodySide: i % 2 === 0 ? -1 : 1 })),
  );

  /** Signed distance of `p` from the muscle's bone, positive on its bulge side. */
  const offset = (m: Muscle, p: { x: number; y: number }) => {
    const dx = m.to.x - m.from.x;
    const dy = m.to.y - m.from.y;
    const length = Math.hypot(dx, dy);
    return (((p.x - m.from.x) * -dy + (p.y - m.from.y) * dx) / length) * m.bulge;
  };

  it("the bulging edge is all on its side, the flat edge all on the other, at flatWidth", () => {
    for (const { m } of all) {
      const { bulging, flat } = muscleEdges(m);
      for (const p of bulging) expect(offset(m, p)).toBeGreaterThan(0);
      for (const p of flat) expect(offset(m, p)).toBeCloseTo(-m.flatWidth, 6);
      // Asymmetric: the bulge reaches much further from the bone than the flat side.
      expect(m.halfWidth).toBeGreaterThan(1.5 * m.flatWidth);
    }
  });

  it("bulges away from the body (outward)", () => {
    for (const { m, bodySide } of all) {
      const { bulging } = muscleEdges(m);
      const i = Math.round(m.peak * MUSCLE_SAMPLES);
      const boneX = m.from.x + (m.to.x - m.from.x) * (i / MUSCLE_SAMPLES);
      expect(Math.sign(bulging[i]!.x - boneX)).toBe(bodySide);
    }
  });

  it("peaks where each muscle should: bicep 40% up from the elbow, forearm near the elbow, thigh in the upper half, calf in the upper third", () => {
    const [upper, fore] = strong.arms[0].muscles;
    const [thigh, calf] = strong.legs[0].muscles;
    expect(upper!.peak).toBeCloseTo(0.6); // from the shoulder: 40% from the elbow
    expect(fore!.peak).toBeLessThan(0.35);
    expect(thigh!.peak).toBeLessThan(0.5);
    expect(calf!.peak).toBeLessThanOrEqual(1 / 3);
    for (const { m } of all) {
      let best = 0;
      for (let i = 0; i <= 100; i++) if (bulgeWidth(m, i / 100) > bulgeWidth(m, best / 100)) best = i;
      expect(Math.abs(best / 100 - m.peak)).toBeLessThanOrEqual(0.01);
      expect(bulgeWidth(m, m.peak)).toBeCloseTo(m.halfWidth, 6);
    }
  });

  it("limbs have no gaps at the elbow or knee: segments share the joint's widths, and the outline is one path", () => {
    for (const limb of [...strong.arms, ...strong.legs]) {
      const [a, b] = limb.muscles;
      expect(a!.endWidth).toBe(b!.startWidth);
      expect(a!.flatWidth).toBe(b!.flatWidth);
      expect(a!.bulge).toBe(b!.bulge);
      expect(limbPath(limb)!.match(/M /g)).toHaveLength(1);
    }
    expect(limbPath(avatarShape(ZERO_DEVELOPMENT).arms[0])).toBeNull(); // a bare limb: draw the bone
  });

  it("the bulge grows with development at every point along the muscle", () => {
    for (const part of ["arms", "legs"] as const) {
      let previous: Muscle[] = avatarShape(withPart(part, 0.01)).arms[0].muscles;
      if (part === "legs") previous = avatarShape(withPart(part, 0.01)).legs[0].muscles;
      for (let d = 0.05; d <= 1.0001; d += 0.05) {
        const shape = avatarShape(withPart(part, d));
        const current = part === "arms" ? shape.arms[0].muscles : shape.legs[0].muscles;
        current.forEach((m, i) => {
          for (let t = 0; t <= 1; t += 0.1)
            expect(bulgeWidth(m, t)).toBeGreaterThanOrEqual(bulgeWidth(previous[i]!, t));
        });
        previous = current;
      }
    }
  });
});

describe("deltoids, torso and pecs", () => {
  it("a deltoid is a dome (an arc over the top), not a full circle", () => {
    const shape = avatarShape(withPart("shoulders", 0.6));
    for (const d of shape.deltoids) expect(deltoidPath(d)).toMatch(/^M [\d.]+ [\d.]+ A /);
    expect(shape.deltoids.map((d) => d.side)).toEqual([-1, 1]);
  });

  it("the pec line is drawn only when chest is above 0", () => {
    const noChest = avatarShape(withPart("back", 0.5)).torso;
    const chest = avatarShape(withPart("chest", 0.5)).torso;
    expect(noChest.kind === "shape" && pecPath(noChest)).toBeNull();
    expect(chest.kind === "shape" && pecPath(chest)).toEqual(expect.any(String));
  });
});

describe("cropFor", () => {
  it("draws the head-and-shoulders crop at small sizes (40 px leaderboard rows) and the full body above", () => {
    expect(cropFor(40)).toBe("bust");
    expect(cropFor(64)).toBe("bust");
    expect(cropFor(65)).toBe("full");
    expect(cropFor(220)).toBe("full");
    expect(cropFor(40, "full")).toBe("full"); // the caller can still ask (the UI preview does)
  });
});

describe("the thighs never overlap", () => {
  /** The gap between the left leg's rightmost edge point and the right leg's leftmost, per muscle. */
  const gaps = (shape: AvatarShape) =>
    [0, 1].map((i) => {
      const left = muscleEdges(shape.legs[0].muscles[i]!);
      const right = muscleEdges(shape.legs[1].muscles[i]!);
      const maxLeft = Math.max(...[...left.bulging, ...left.flat].map((p) => p.x));
      const minRight = Math.min(...[...right.bulging, ...right.flat].map((p) => p.x));
      return minRight - maxLeft;
    });

  it("on a stick torso (chest, back and core 0) with developed legs: the hips spread, no crossing at the crotch", () => {
    for (let legs = 0.01; legs <= 1.0001; legs += 0.01) {
      const shape = avatarShape({ ...ZERO_DEVELOPMENT, legs, arms: 0.5 });
      expect(shape.torso.kind).toBe("line");
      for (const gap of gaps(shape)) expect(gap).toBeGreaterThan(strokeFor(1000)); // wider than the thickest outline
    }
  });

  it("on any body: random developments, including a narrow waist with big legs", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const d = { ...randomDevelopment(seed), legs: 0.01 + (seed % 100) / 101 };
      for (const gap of gaps(avatarShape(d))) expect(gap).toBeGreaterThan(strokeFor(1000));
    }
    for (const gap of gaps(avatarShape({ ...ZERO_DEVELOPMENT, chest: 0.5, legs: 1 }))) expect(gap).toBeGreaterThan(3);
  });

  it("stick legs still start together on the Rookie (the classic stickman)", () => {
    const rookie = avatarShape(ZERO_DEVELOPMENT);
    expect(rookie.legs[0].joints[0]).toEqual(rookie.legs[1].joints[0]);
  });
});
