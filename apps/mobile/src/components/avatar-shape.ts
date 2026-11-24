import { BODY_PARTS, type BodyPart } from "@levelup/shared";

// The stickman's body as plain numbers (docs/ARCHITECTURE.md, "Avatar prototype").
//
// `avatarShape(development, lean)` decides WHERE everything is and HOW BIG it is; the
// Avatar component only turns these numbers into SVG. Keeping the maths here, away from
// React, means unit tests can check the rules directly (0 is lines only, parts grow
// independently, sizes only go up, the head never changes), and a later renderer (Rive)
// can be checked against the same inputs.
//
// Coordinates are in a 120 × 200 viewBox, y pointing down. The figure faces the viewer.

export type Point = { x: number; y: number };
export type Circle = { cx: number; cy: number; r: number };
export type Development = Record<BodyPart, number>;

/** A muscle along a bone: an outlined bulge, widest in the middle, `halfWidth` from the bone. */
export type Muscle = { from: Point; to: Point; halfWidth: number };

/** One arm or leg: its bone as a polyline (always drawn), and its muscles (none at development 0). */
export type Limb = { joints: Point[]; muscles: Muscle[] };

export type Torso =
  /** Chest, back and core all at 0: the classic stickman spine. */
  | { kind: "line"; from: Point; to: Point }
  /**
   * An outlined trapezoid, `shoulderHalf` wide at the top (back: the V-taper) and `waistHalf`
   * at the bottom (core), with a pec line `pecDepth` below the top (chest; 0 = none).
   */
  | { kind: "shape"; top: number; bottom: number; shoulderHalf: number; waistHalf: number; pecDepth: number };

export type AvatarShape = {
  head: Circle;
  neck: { from: Point; to: Point };
  torso: Torso;
  /** Left then right (as seen on screen). */
  arms: [Limb, Limb];
  legs: [Limb, Limb];
  /** Deltoid caps over the shoulder joints; empty at shoulders 0. */
  deltoids: Circle[];
  hands: [Circle, Circle];
};

export const VIEWBOX = { width: 120, height: 200 } as const;
/** The head-and-shoulders crop: the top of the same drawing. */
export const BUST_VIEWBOX = { y: 0, height: 104 } as const;

const CX = VIEWBOX.width / 2;

/** The head: the same circle at every development, stage, face and lean. */
export const HEAD: Circle = Object.freeze({ cx: CX, cy: 34, r: 24 });

const NECK_TOP = HEAD.cy + HEAD.r;
const SHOULDER_Y = 68;
const HIP_Y = 122;
const FOOT_Y = 192;

/**
 * Size is front-loaded: a part's muscles grow with development^FRONT_LOAD, so the first
 * quarter of development (0 to 0.25) already draws 44% of the full size. The rule (weeks
 * of training to reach 0.25) isn't sped up; the drawing makes the early change visible.
 * Tuned with the UI preview's "first 12 weeks" strip.
 */
export const FRONT_LOAD = 0.6;

/** 0 → 0, 1 → 1, monotonic, steep at the start. */
export function growth(development: number): number {
  const d = clamp01(development);
  return d === 0 ? 0 : d ** FRONT_LOAD;
}

/** Sizes at growth 0+ (the first visible muscle) and at growth 1, per measurement. */
const SIZE = {
  shoulderHalf: [9, 28], // back: half the torso's top width (the V-taper)
  pecDepth: [3, 11], // chest: how far below the top the pec line curves
  waistHalf: [6, 14], // core: half the waist; 6 even at core 0 (a normal narrow waist)
  deltoid: [3.5, 9], // shoulders: deltoid cap radius
  upperArm: [2.5, 8], // arms
  forearm: [2, 5.5],
  thigh: [3, 10], // legs
  calf: [2.5, 6.5],
} as const;

/** The size for a part's development: undefined at 0 (no muscle, just the line). */
function size(key: keyof typeof SIZE, development: number): number | undefined {
  const g = growth(development);
  if (g === 0) return undefined;
  const [min, max] = SIZE[key];
  return min + (max - min) * g;
}

/** Half the waist when the torso is a shape: core at 0 is a narrow waist, not a point. */
const waistHalf = (core: number) => size("waistHalf", core) ?? SIZE.waistHalf[0];

/**
 * The body for each part's development (0 to 1; outside values are clamped).
 *
 * `lean` is reserved for the endurance look (a leaner, stamina build) and is always 0 in
 * Milestone 6: it's accepted so the contract doesn't change later, and nothing reads it yet.
 */
export function avatarShape(development: Development, lean = 0): AvatarShape {
  void lean; // reserved (docs/ARCHITECTURE.md: the avatar contract)
  const d = Object.fromEntries(BODY_PARTS.map((p) => [p, clamp01(development[p])])) as Development;

  const torsoIsShape = d.chest > 0 || d.back > 0 || d.core > 0;
  const shoulderHalf = torsoIsShape ? (size("shoulderHalf", d.back) ?? SIZE.shoulderHalf[0]) : 0;
  const torso: Torso = torsoIsShape
    ? {
        kind: "shape",
        top: SHOULDER_Y - 2,
        bottom: HIP_Y,
        shoulderHalf,
        waistHalf: waistHalf(d.core),
        pecDepth: size("pecDepth", d.chest) ?? 0,
      }
    : { kind: "line", from: { x: CX, y: NECK_TOP }, to: { x: CX, y: HIP_Y } };

  // Arms hang from the shoulder joints: the ends of the torso's top, or a short shoulder
  // bar on the stick body (the Rookie look).
  const shoulderX = torsoIsShape ? shoulderHalf : 12;
  const arms = ([-1, 1] as const).map((side) => {
    const shoulder = { x: CX + side * shoulderX, y: SHOULDER_Y };
    const elbow = { x: shoulder.x + side * 7, y: 100 };
    const wrist = { x: shoulder.x + side * 9, y: 128 };
    const upper = size("upperArm", d.arms);
    const fore = size("forearm", d.arms);
    return {
      joints: [shoulder, elbow, wrist],
      muscles:
        upper === undefined || fore === undefined
          ? []
          : [
              { from: shoulder, to: elbow, halfWidth: upper },
              { from: elbow, to: wrist, halfWidth: fore },
            ],
    };
  }) as [Limb, Limb];

  const deltoidR = size("deltoid", d.shoulders);
  const deltoids =
    deltoidR === undefined ? [] : arms.map((arm) => ({ cx: arm.joints[0]!.x, cy: SHOULDER_Y + 2, r: deltoidR }));

  // Legs start together on the stick body, and at the hips when there's a waist.
  const hipX = torsoIsShape ? waistHalf(d.core) * 0.55 : 0;
  const legs = ([-1, 1] as const).map((side) => {
    const hip = { x: CX + side * hipX, y: HIP_Y };
    const knee = { x: hip.x + side * 9, y: 158 };
    const foot = { x: hip.x + side * 12, y: FOOT_Y };
    const thigh = size("thigh", d.legs);
    const calf = size("calf", d.legs);
    return {
      joints: [hip, knee, foot],
      muscles:
        thigh === undefined || calf === undefined
          ? []
          : [
              { from: hip, to: knee, halfWidth: thigh },
              { from: knee, to: foot, halfWidth: calf },
            ],
    };
  }) as [Limb, Limb];

  const hands = arms.map((arm) => ({ cx: arm.joints[2]!.x, cy: arm.joints[2]!.y + 3, r: 4.5 })) as [Circle, Circle];

  return {
    head: { ...HEAD },
    neck: { from: { x: CX, y: NECK_TOP }, to: { x: CX, y: torsoIsShape ? SHOULDER_Y - 2 : NECK_TOP } },
    torso,
    arms,
    legs,
    deltoids,
    hands,
  };
}

/**
 * The outline of a muscle: tapered at both ends (60% of the width), widest in the middle.
 * A quadratic curve reaches half-way to its control point, so the control sits at twice
 * the middle width minus the ends' average.
 */
export function musclePath({ from, to, halfWidth }: Muscle): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const nx = -dy / length;
  const ny = dx / length;
  const end = halfWidth * 0.6;
  const control = 2 * halfWidth - end;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const at = (p: Point, w: number) => `${round(p.x + nx * w)} ${round(p.y + ny * w)}`;
  return [
    `M ${at(from, end)}`,
    `Q ${at(mid, control)} ${at(to, end)}`,
    `L ${at(to, -end)}`,
    `Q ${at(mid, -control)} ${at(from, -end)}`,
    "Z",
  ].join(" ");
}

/** The torso's outline (shape torsos only), with rounded shoulders. */
export function torsoPath(t: Extract<Torso, { kind: "shape" }>): string {
  const l = CX - t.shoulderHalf;
  const r = CX + t.shoulderHalf;
  return [
    `M ${round(l)} ${t.top + 6}`,
    `Q ${round(l)} ${t.top} ${round(l + 6)} ${t.top}`,
    `L ${round(r - 6)} ${t.top}`,
    `Q ${round(r)} ${t.top} ${round(r)} ${t.top + 6}`,
    `L ${round(CX + t.waistHalf)} ${t.bottom}`,
    `L ${round(CX - t.waistHalf)} ${t.bottom}`,
    "Z",
  ].join(" ");
}

/** The pec line: two curves meeting at the sternum; null when chest is 0. */
export function pecPath(t: Extract<Torso, { kind: "shape" }>): string | null {
  if (t.pecDepth === 0) return null;
  const y = t.top + 8;
  const half = Math.max(t.shoulderHalf - 5, 6);
  return (
    `M ${round(CX - half)} ${y} Q ${round(CX - half)} ${round(y + t.pecDepth)} ${CX} ${round(y + t.pecDepth * 0.7)} ` +
    `Q ${round(CX + half)} ${round(y + t.pecDepth)} ${round(CX + half)} ${y}`
  );
}

/** The stroke width (viewBox units) for a figure drawn `heightPx` tall: thicker when small, so lines stay at least ~1.4 px. */
export function strokeFor(heightPx: number, viewBoxHeight: number = VIEWBOX.height): number {
  return Math.max(3, 1.4 / (heightPx / viewBoxHeight));
}

export const ZERO_DEVELOPMENT: Development = Object.freeze({
  chest: 0,
  back: 0,
  shoulders: 0,
  arms: 0,
  core: 0,
  legs: 0,
});

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
const round = (n: number) => Math.round(n * 100) / 100;
