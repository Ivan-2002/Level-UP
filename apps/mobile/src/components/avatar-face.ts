import { HEAD, type Circle, type Point } from "./avatar-shape";

// The avatar's face (docs/ARCHITECTURE.md, "The face is identity, not progress").
//
// The PLAYER chooses the face (a preset key per slot); the SYSTEM chooses the expression
// (neutral, proud on the level-up), which only bends the chosen brows and mouth. Like the
// body, the face is plain numbers here and drawn by the Avatar component. Every preset
// stays inside the head circle (tested), so no face can change the head or overflow it.
//
// Milestone 6b draws the default and ONE alternative per slot, to prove the slot; the
// other presets and the picker come in 6e.

/** Each slot's presets; the FIRST one is the default. */
export const FACE_PRESETS = {
  eyes: ["dot", "round"],
  brows: ["none", "flat"],
  mouth: ["smile", "grin"],
  hair: ["none", "short"],
  /** "none" is the outline look (the head filled with the background); tones are colour tokens (theme/tokens.ts SKIN_TONES). */
  skinTone: ["none", "tone3"],
} as const satisfies Record<string, readonly string[]>;

export type FaceSlot = keyof typeof FACE_PRESETS;
export const FACE_SLOTS = Object.keys(FACE_PRESETS) as FaceSlot[];
export type Face = { [S in FaceSlot]: (typeof FACE_PRESETS)[S][number] };

export const EXPRESSIONS = ["neutral", "proud"] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export const DEFAULT_FACE: Face = Object.freeze(
  Object.fromEntries(FACE_SLOTS.map((slot) => [slot, FACE_PRESETS[slot][0]])) as Face,
);

/**
 * The face to draw from whatever was stored: any missing or unknown key falls back to the
 * slot's default, so a face saved by a newer app (with presets this one doesn't know)
 * never breaks an older one. Unknown slots are ignored.
 */
export function resolveFace(stored: unknown): Face {
  const raw = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  return Object.fromEntries(
    FACE_SLOTS.map((slot) => {
      const presets: readonly string[] = FACE_PRESETS[slot];
      const value = raw[slot];
      return [slot, typeof value === "string" && presets.includes(value) ? value : presets[0]];
    }),
  ) as Face;
}

/** A quadratic curve; its control point keeps the curve inside the triangle of its three points. */
export type Curve = { from: Point; control: Point; to: Point };

export type FaceShape = {
  eyes: ({ kind: "dot"; eye: Circle } | { kind: "ring"; eye: Circle; pupil: Circle })[];
  brows: { from: Point; to: Point }[];
  mouth: { kind: "smile"; curve: Curve } | { kind: "grin"; curve: Curve; top: { from: Point; to: Point } };
  /**
   * Hair over the top of the head with a ragged fringe: the outline runs along the head
   * from `arcFrom` to `arcTo`, then back through the `fringe` points (alternating roots and
   * tuft tips). Null for "none".
   */
  hair: { arcFrom: Point; arcTo: Point; fringe: Point[] } | null;
  /** The skin tone's key, or null for the outline look. */
  skinTone: Exclude<Face["skinTone"], "none"> | null;
};

const { cx: CX, cy: CY, r: R } = HEAD;
const EYE_Y = CY - 1;
const EYE_DX = 8.5;

/**
 * The short hair's fringe, right to left: roots alternating with five tuft tips, each a
 * depth below the head's outline at its x, so the fringe follows the head and stays inside
 * it (tested). Uneven tufts read as hair, not a cap or a helmet.
 */
const FRINGE: Point[] = (() => {
  const outlineY = (x: number) => CY - Math.sqrt(R ** 2 - (x - CX) ** 2);
  const right = CX + R * Math.cos((342 * Math.PI) / 180);
  const left = CX + R * Math.cos((198 * Math.PI) / 180);
  const tufts = [6.5, 8, 6, 8.5, 6.5]; // how far each tip hangs below the outline
  const steps = 2 * tufts.length;
  const points: Point[] = [];
  for (let i = 1; i < steps; i++) {
    const x = right + ((left - right) * i) / steps;
    const depth = i % 2 === 1 ? tufts[(i - 1) / 2]! : 3;
    points.push({ x: Math.round(x * 100) / 100, y: Math.round((outlineY(x) + depth) * 100) / 100 });
  }
  return points;
})();

/** The face for a chosen preset set and the system's expression. */
export function faceShape(face: Face, expression: Expression = "neutral"): FaceShape {
  const proud = expression === "proud";

  const eyes = ([-1, 1] as const).map((side) =>
    face.eyes === "round"
      ? {
          kind: "ring" as const,
          eye: { cx: CX + side * EYE_DX, cy: EYE_Y, r: 4.2 },
          pupil: { cx: CX + side * EYE_DX, cy: EYE_Y + 0.6, r: 1.9 },
        }
      : { kind: "dot" as const, eye: { cx: CX + side * EYE_DX, cy: EYE_Y, r: 2.4 } },
  );

  // Proud raises the brows and lifts their inner ends.
  const browY = EYE_Y - (face.eyes === "round" ? 9 : 7) - (proud ? 2 : 0);
  const brows =
    face.brows === "none"
      ? []
      : ([-1, 1] as const).map((side) => ({
          from: { x: CX + side * 4.5, y: browY - (proud ? 1.5 : 0) },
          to: { x: CX + side * 12.5, y: browY },
        }));

  // Proud widens the mouth and deepens its curve.
  const mouthY = CY + 9;
  const half = proud ? 8.5 : 6.5;
  const depth = face.mouth === "grin" ? (proud ? 13 : 10) : proud ? 9 : 6;
  const curve: Curve = {
    from: { x: CX - half, y: mouthY },
    control: { x: CX, y: mouthY + depth },
    to: { x: CX + half, y: mouthY },
  };
  const mouth: FaceShape["mouth"] =
    face.mouth === "grin" ? { kind: "grin", curve, top: { from: curve.from, to: curve.to } } : { kind: "smile", curve };

  const hair: FaceShape["hair"] =
    face.hair === "short" ? { arcFrom: onHead(198), arcTo: onHead(342), fringe: FRINGE } : null;

  return { eyes, brows, mouth, hair, skinTone: face.skinTone === "none" ? null : face.skinTone };
}

/** The point on the head's outline at `degrees` (0 = right, 270 = the top; y points down). */
function onHead(degrees: number): Point {
  const a = (degrees * Math.PI) / 180;
  return { x: round(CX + R * Math.cos(a)), y: round(CY + R * Math.sin(a)) };
}

/** Every point a face is built from: circles' extremes, line ends, curves' control points. */
export function facePoints(shape: FaceShape): Point[] {
  const circle = (c: Circle) => [
    { x: c.cx - c.r, y: c.cy },
    { x: c.cx + c.r, y: c.cy },
    { x: c.cx, y: c.cy - c.r },
    { x: c.cx, y: c.cy + c.r },
  ];
  const curve = (c: Curve) => [c.from, c.control, c.to];
  return [
    ...shape.eyes.flatMap((e) => (e.kind === "ring" ? [...circle(e.eye), ...circle(e.pupil)] : circle(e.eye))),
    ...shape.brows.flatMap((b) => [b.from, b.to]),
    ...curve(shape.mouth.curve),
    ...(shape.hair ? [shape.hair.arcFrom, shape.hair.arcTo, ...shape.hair.fringe] : []),
  ];
}

/** The hair's outline: along the top of the head, then back through the fringe's tufts. */
export function hairPath(hair: NonNullable<FaceShape["hair"]>): string {
  const { arcFrom, arcTo, fringe } = hair;
  const tufts = fringe.map((p) => `L ${p.x} ${p.y}`).join(" ");
  return `M ${arcFrom.x} ${arcFrom.y} A ${R} ${R} 0 0 1 ${arcTo.x} ${arcTo.y} ${tufts} Z`;
}

export const curvePath = (c: Curve) => `M ${c.from.x} ${c.from.y} Q ${c.control.x} ${c.control.y} ${c.to.x} ${c.to.y}`;

const round = (n: number) => Math.round(n * 100) / 100;
