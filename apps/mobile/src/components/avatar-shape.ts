import { BODY_PARTS, type BodyPart } from "@levelup/shared";

// The stickman's body as plain numbers (docs/ARCHITECTURE.md, "Avatar prototype").
//
// `avatarShape(development, stamina)` decides WHERE everything is and HOW BIG it is; the
// Avatar component only turns these numbers into SVG. Keeping the maths here, away from
// React, means unit tests can check the rules directly (0 is lines only, parts grow
// independently, sizes only go up, the head never changes), and a later renderer (Rive)
// can be checked against the same inputs.
//
// Coordinates are in a 120 × 200 viewBox, y pointing down. The figure faces the viewer.

export type Point = { x: number; y: number };
export type Circle = { cx: number; cy: number; r: number };
export type Development = Record<BodyPart, number>;

/**
 * A muscle along a bone, bulging on ONE side like a cartoon bicep: the `bulge` side's edge
 * swells out to `halfWidth` at `peak`, the other edge runs flat, `flatWidth` from the bone.
 * `startWidth` and `endWidth` are the bulging edge's distance at the two joints; a limb's
 * segments share the width at their common joint, so the limb is one continuous outline.
 */
export type Muscle = {
  from: Point;
  to: Point;
  /** The bulging edge's peak distance from the bone. */
  halfWidth: number;
  /** Which side bulges: +1 is the bone's left normal (−dy, dx), −1 the other side. Always away from the body. */
  bulge: 1 | -1;
  /** Where the bulge peaks: 0 at `from`, 1 at `to`. */
  peak: number;
  startWidth: number;
  endWidth: number;
  flatWidth: number;
};

/** One arm or leg: its bone as a polyline (drawn while it has no muscles), and its muscles (none at development 0). */
export type Limb = { joints: Point[]; muscles: Muscle[] };

/** A deltoid cap: a half-dome over the top of the shoulder, leaning out over the top of the upper arm. */
export type Deltoid = Circle & { side: -1 | 1 };

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
  deltoids: Deltoid[];
  hands: [Circle, Circle];
};

export const VIEWBOX = { width: 120, height: 200 } as const;
/** The head-and-shoulders crop: the top of the same drawing. */
export const BUST_VIEWBOX = { y: 0, height: 104 } as const;

const CX = VIEWBOX.width / 2;

/** The head: the same circle at every development, stage, face and stamina. */
export const HEAD: Circle = Object.freeze({ cx: CX, cy: 34, r: 24 });

const NECK_TOP = HEAD.cy + HEAD.r;
const SHOULDER_Y = 68;
const HIP_Y = 122;
const FOOT_Y = 192;

/**
 * Sizes are LINEAR in the development avatarShape is given. The front-loading
 * (development^FRONT_LOAD) is applied before this, by the Avatar component
 * (avatar-growth.ts), so every renderer maps its inputs the same way.
 *
 * Sizes just above 0 (the first visible muscle) and at 1, per measurement.
 */
const SIZE = {
  shoulderHalf: [9, 28], // back: half the torso's top width (the V-taper)
  pecDepth: [4, 13], // chest: how far below the top the pec line curves
  waistHalf: [6, 14], // core: half the waist; 6 even at core 0 (a normal narrow waist)
  deltoid: [4, 10], // shoulders: deltoid cap radius
  upperArm: [4.5, 13], // arms: the bicep's peak, from the bone
  forearm: [3.5, 8.5],
  thigh: [5, 15], // legs
  calf: [4, 10],
} as const;

/**
 * How far each thigh's flat inner edge stays from the centre line, at least: the two edges
 * are then 2 × this apart, more than the thickest outline (strokeFor's minimum, 3), so
 * there's always a gap between the thighs.
 */
export const THIGH_CLEARANCE = 2.5;

/** The size for a part's development: undefined at 0 (no muscle, just the line). */
function size(key: keyof typeof SIZE, development: number): number | undefined {
  const d = clamp01(development);
  if (d === 0) return undefined;
  const [min, max] = SIZE[key];
  return min + (max - min) * d;
}

/** Half the waist when the torso is a shape: core at 0 is a narrow waist, not a point. */
const waistHalf = (core: number) => size("waistHalf", core) ?? SIZE.waistHalf[0];

/**
 * The body for each part's development (0 to 1; outside values are clamped).
 *
 * `stamina` is the EARNED endurance stat (the competition plan's stamina; distinct from the
 * player's CHOSEN `body` build). High stamina may later draw a leaner look. It is always 0 in
 * Milestone 6: it's accepted so the contract doesn't change later, and nothing reads it yet.
 */
export function avatarShape(development: Development, stamina = 0): AvatarShape {
  void stamina; // reserved (docs/ARCHITECTURE.md: the avatar contract)
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
    if (upper === undefined || fore === undefined) return { joints: [shoulder, elbow, wrist], muscles: [] };
    const elbowWidth = fore * 0.7;
    const flatWidth = Math.max(1.5, fore * 0.45);
    return {
      joints: [shoulder, elbow, wrist],
      muscles: [
        // The bicep: on the outer side, peaking 40% of the way up from the elbow.
        muscle(shoulder, elbow, side, {
          halfWidth: upper,
          peak: 0.6,
          startWidth: upper * 0.6,
          endWidth: elbowWidth,
          flatWidth,
        }),
        // The forearm: a milder bulge near the elbow.
        muscle(elbow, wrist, side, {
          halfWidth: fore,
          peak: 0.2,
          startWidth: elbowWidth,
          endWidth: fore * 0.45,
          flatWidth,
        }),
      ],
    };
  }) as [Limb, Limb];

  const deltoidR = size("deltoid", d.shoulders);
  const deltoids: Deltoid[] =
    deltoidR === undefined
      ? []
      : arms.map((arm, i) => {
          const side = i === 0 ? -1 : 1;
          return { cx: arm.joints[0]!.x + side * deltoidR * 0.45, cy: SHOULDER_Y + 2, r: deltoidR, side };
        });

  // Legs start together on the stick body, and at the hips when there's a waist. Once the
  // legs have muscle the hips are at least wide enough that the thighs' flat inner edges
  // never meet (6c review: on a stick torso both thighs started at one point and crossed).
  const calfSize = size("calf", d.legs);
  const legFlat = calfSize === undefined ? 0 : Math.max(1.5, calfSize * 0.45);
  const hipX = Math.max(
    torsoIsShape ? waistHalf(d.core) * 0.55 : 0,
    calfSize === undefined ? 0 : legFlat + THIGH_CLEARANCE,
  );
  const legs = ([-1, 1] as const).map((side) => {
    const hip = { x: CX + side * hipX, y: HIP_Y };
    const knee = { x: hip.x + side * 9, y: 158 };
    const foot = { x: hip.x + side * 12, y: FOOT_Y };
    const thigh = size("thigh", d.legs);
    const calf = size("calf", d.legs);
    if (thigh === undefined || calf === undefined) return { joints: [hip, knee, foot], muscles: [] };
    const kneeWidth = calf * 0.65;
    const flatWidth = legFlat;
    return {
      joints: [hip, knee, foot],
      muscles: [
        // The thigh: on the outer side, peaking in the upper half.
        muscle(hip, knee, side, {
          halfWidth: thigh,
          peak: 0.35,
          startWidth: thigh * 0.7,
          endWidth: kneeWidth,
          flatWidth,
        }),
        // The calf: on the outer side (the back isn't visible from the front), peaking in the upper third.
        muscle(knee, foot, side, {
          halfWidth: calf,
          peak: 0.3,
          startWidth: kneeWidth,
          endWidth: calf * 0.4,
          flatWidth,
        }),
      ],
    };
  }) as [Limb, Limb];

  const hands = arms.map((arm) => ({ cx: arm.joints[2]!.x, cy: arm.joints[2]!.y + 3, r: 4.5 })) as [Circle, Circle];

  return {
    head: { ...HEAD },
    neck: { from: { x: CX, y: NECK_TOP }, to: { x: CX, y: torsoIsShape ? SHOULDER_Y - 2 - TRAPS : NECK_TOP } },
    torso,
    arms,
    legs,
    deltoids,
    hands,
  };
}

/**
 * A muscle whose bulge faces away from the body: `bodySide` is the limb's side of the
 * figure (−1 left, +1 right on screen), turned into the bone's normal that points outward.
 */
function muscle(
  from: Point,
  to: Point,
  bodySide: -1 | 1,
  widths: Pick<Muscle, "halfWidth" | "peak" | "startWidth" | "endWidth" | "flatWidth">,
): Muscle {
  const normalX = -(to.y - from.y); // x of the left normal (−dy, dx), before normalising
  return { from, to, bulge: Math.sign(normalX) === bodySide ? 1 : -1, ...widths };
}

/** Samples per muscle edge: enough for a smooth curve at 220 px. */
export const MUSCLE_SAMPLES = 12;

/**
 * 0 at the ends, 1 at `peak`, flat at the peak: a broad, rounded bulge (a quarter sine on
 * each side of the peak). The ends meet the next segment at the same width, so the
 * limb's outline is continuous at the joint.
 */
export function bulgeProfile(t: number, peak: number): number {
  const u = t <= peak ? t / peak : (1 - t) / (1 - peak);
  return Math.sin((Math.PI / 2) * u);
}

/** The bulging edge's distance from the bone at `t` (0 at `from`, 1 at `to`). */
export function bulgeWidth(m: Muscle, t: number): number {
  const base = m.startWidth + (m.endWidth - m.startWidth) * t;
  return base + (m.halfWidth - base) * bulgeProfile(t, m.peak);
}

/** A muscle's two edges as points, from `from` to `to`: the bulging one, and the flat one. */
export function muscleEdges(m: Muscle): { bulging: Point[]; flat: Point[] } {
  const dx = m.to.x - m.from.x;
  const dy = m.to.y - m.from.y;
  const length = Math.hypot(dx, dy);
  const nx = (-dy / length) * m.bulge;
  const ny = (dx / length) * m.bulge;
  const bulging: Point[] = [];
  const flat: Point[] = [];
  for (let i = 0; i <= MUSCLE_SAMPLES; i++) {
    const t = i / MUSCLE_SAMPLES;
    const bone = { x: m.from.x + dx * t, y: m.from.y + dy * t };
    const w = bulgeWidth(m, t);
    bulging.push({ x: bone.x + nx * w, y: bone.y + ny * w });
    flat.push({ x: bone.x - nx * m.flatWidth, y: bone.y - ny * m.flatWidth });
  }
  return { bulging, flat };
}

/**
 * A limb with muscles as ONE closed outline: down the bulging side of every segment, back
 * up the flat side. No seams at the elbow or knee. Null for a bare limb (draw its bone).
 */
export function limbPath(limb: Limb): string | null {
  if (limb.muscles.length === 0) return null;
  const edges = limb.muscles.map(muscleEdges);
  const out = edges.flatMap((e) => e.bulging);
  const back = edges.flatMap((e) => e.flat).reverse();
  return pointsPath([...out, ...back]);
}

/**
 * A deltoid cap: a half-dome over the top of the shoulder, tapering to a point down the
 * outside of the upper arm (it covers the top of the arm's outline).
 */
export function deltoidPath({ cx, cy, r, side }: Deltoid): string {
  const inner = cx - side * r; // the end towards the neck
  const outer = cx + side * r;
  const tip = { x: cx + side * r * 0.75, y: cy + r * 1.9 }; // down the outside of the arm
  const sweep = side === 1 ? 1 : 0; // the dome always goes over the top
  return [
    `M ${round(inner)} ${round(cy)}`,
    `A ${round(r)} ${round(r)} 0 0 ${sweep} ${round(outer)} ${round(cy)}`,
    `Q ${round(outer + side * r * 0.1)} ${round(cy + r)} ${round(tip.x)} ${round(tip.y)}`,
    `Q ${round(cx)} ${round(cy + r * 0.9)} ${round(inner)} ${round(cy)}`,
    "Z",
  ].join(" ");
}

/** The torso's outline (shape torsos only): traps sloping up to the neck, rounded shoulders, lats curving in to the waist. */
export function torsoPath(t: Extract<Torso, { kind: "shape" }>): string {
  const l = CX - t.shoulderHalf;
  const r = CX + t.shoulderHalf;
  const lat = t.top + (t.bottom - t.top) * 0.55;
  return [
    `M ${round(l)} ${t.top + 6}`,
    `Q ${round(l)} ${t.top} ${round(l + 6)} ${t.top}`,
    `L ${CX - 6} ${t.top - TRAPS}`,
    `L ${CX + 6} ${t.top - TRAPS}`,
    `L ${round(r - 6)} ${t.top}`,
    `Q ${round(r)} ${t.top} ${round(r)} ${t.top + 6}`,
    `Q ${round(r)} ${round(lat)} ${round(CX + t.waistHalf)} ${t.bottom}`,
    `L ${round(CX - t.waistHalf)} ${t.bottom}`,
    `Q ${round(l)} ${round(lat)} ${round(l)} ${t.top + 6}`,
    "Z",
  ].join(" ");
}

/** How far the torso's top rises from the shoulders to the base of the neck. */
const TRAPS = 3;

/** The pecs: two curves from the armpits down to the sternum, plus the sternum line; null when chest is 0. */
export function pecPath(t: Extract<Torso, { kind: "shape" }>): string | null {
  if (t.pecDepth === 0) return null;
  const y = t.top + 5;
  const half = Math.max(t.shoulderHalf - 4, 6);
  const sternum = y + t.pecDepth * 0.55;
  const low = y + t.pecDepth * 1.35;
  return (
    `M ${round(CX - half)} ${y + 1} Q ${round(CX - half * 0.55)} ${round(low)} ${CX} ${round(sternum)} ` +
    `Q ${round(CX + half * 0.55)} ${round(low)} ${round(CX + half)} ${y + 1} ` +
    `M ${CX} ${round(sternum)} L ${CX} ${y - 1}`
  );
}

/** The pec line is drawn this much bolder than the outline, so it reads at 220 px. */
export const PEC_STROKE = 1.25;

const pointsPath = (points: Point[]) => `M ${points.map((p) => `${round(p.x)} ${round(p.y)}`).join(" L ")} Z`;

/** At this height (px) or less the avatar is a head-and-shoulders crop by default: a full body is unreadable at leaderboard size (decided 2026-11-24). */
export const SMALL_AVATAR_HEIGHT = 64;

/** The view to draw: the caller's choice, else the crop at small sizes and the full body above. */
export function cropFor(heightPx: number, crop?: "full" | "bust"): "full" | "bust" {
  return crop ?? (heightPx <= SMALL_AVATAR_HEIGHT ? "bust" : "full");
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
