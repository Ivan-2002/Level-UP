import { HEAD, type AvatarShape, type Point } from "./avatar-shape";

// The stage extras (docs/ARCHITECTURE.md, "Avatar prototype"): a layer on top of the body,
// built FROM the body's numbers so the outfit and the wristbands fit any development.
//
// Which extras a player has is data (avatar_stage.extras, cumulative), not code: the app
// draws the extras it knows and ignores any it doesn't, so a stage or extra added on the
// server never breaks an older app.

export const KNOWN_EXTRAS = ["wristbands", "outfit", "headband", "cape"] as const;
export type Extra = (typeof KNOWN_EXTRAS)[number];

export type ExtrasShape = {
  /** Drawn BEHIND the body (legs and arms in front). */
  cape: string | null;
  /** The cape's star clasp, drawn over the collar. */
  clasp: string | null;
  /** Drawn over the torso and thighs, under the arms. */
  outfit: { top: string; shorts: string } | null;
  /** Drawn over the forearms. */
  wristbands: string[];
  /** Drawn over the head and hair. */
  headband: { band: string; knot: string } | null;
};

/** The known extras in `extras`, in their order in KNOWN_EXTRAS; unknown keys are dropped. */
export function knownExtras(extras: readonly string[]): Extra[] {
  return KNOWN_EXTRAS.filter((e) => extras.includes(e));
}

/** Where the cape's sides end, as a share of the way from the knee to the foot (mid-calf). */
export const CAPE_HEM_DOWN_CALF = 0.5;
/** How far past the shoulders the cape flares at its hem, on each side. */
export const CAPE_FLARE = 22;
const CLASP_RADIUS = 4.5;
/** The shorts' hem: hips are at y 122, the thigh's bulge peaks at about y 135. */
export const SHORTS_HEM_Y = 132;

export function extrasShape(shape: AvatarShape, extras: readonly string[]): ExtrasShape {
  const has = new Set<string>(knownExtras(extras));
  const cx = HEAD.cx;
  const torso = shape.torso;
  const top = torso.kind === "shape" ? torso.top : 66;
  const bottom = torso.kind === "shape" ? torso.bottom : 122;
  const shoulderHalf = torso.kind === "shape" ? torso.shoulderHalf : 12;
  const waistHalf = torso.kind === "shape" ? torso.waistHalf : 8;

  // The cape (Legend): from the shoulders to mid-calf, flaring well past the shoulders on
  // both sides. It's drawn BEHIND the legs and arms, so it never hides how developed they
  // are (6c review: a short cape was nearly invisible, and length never hid the legs).
  let cape: string | null = null;
  let clasp: string | null = null;
  if (has.has("cape")) {
    const h = shoulderHalf;
    const leg = shape.legs[0].joints;
    const hemSide = leg[1]!.y + (leg[2]!.y - leg[1]!.y) * CAPE_HEM_DOWN_CALF;
    // The sides billow out just below the shoulders (curved, not straight), so the cape
    // shows beside the arms in the 40 px head-and-shoulders crop too.
    const billowY = top + 26;
    cape = path([
      `M ${cx - h} ${top + 2}`,
      `L ${cx + h} ${top + 2}`,
      `Q ${cx + h + CAPE_FLARE} ${billowY} ${cx + h + CAPE_FLARE} ${hemSide}`,
      `Q ${cx} ${hemSide - 6} ${cx - h - CAPE_FLARE} ${hemSide}`,
      `Q ${cx - h - CAPE_FLARE} ${billowY} ${cx - h} ${top + 2}`,
      "Z",
    ]);
    // A small star clasp at the collar (the plan's Legend detail), over the neck line.
    clasp = star(cx, top + 3, CLASP_RADIUS);
  }

  let outfit: ExtrasShape["outfit"] = null;
  if (has.has("outfit")) {
    // A tank top: the torso's outline 1 unit wider (it covers the body's line), with a scoop neck.
    const half = (y: number) => {
      const t = (y - top) / (bottom - top);
      return shoulderHalf + (waistHalf - shoulderHalf) * t + 1;
    };
    const yTop = top + 4;
    const yBottom = bottom - 2;
    const neck = Math.max(shoulderHalf - 7, 4);
    const topPath = path([
      `M ${cx - half(yTop)} ${yTop}`,
      `L ${cx - neck} ${yTop}`,
      `Q ${cx} ${yTop + 12} ${cx + neck} ${yTop}`,
      `L ${cx + half(yTop)} ${yTop}`,
      `L ${cx + half(yBottom)} ${yBottom}`,
      `L ${cx - half(yBottom)} ${yBottom}`,
      "Z",
    ]);
    // Shorts: from the waist to the upper thigh, as wide as the thighs (or a minimum on stick
    // legs). The hem sits ABOVE the thigh's bulge (which peaks about 35% down from the hip),
    // so the shorts never hide how developed the legs are (6c review).
    const thigh = shape.legs[0].muscles[0]?.halfWidth ?? 3;
    const w = waistHalf + 1;
    const hem = SHORTS_HEM_Y;
    const legHem = (side: -1 | 1) => {
      const hip = shape.legs[side === -1 ? 0 : 1].joints[0]!;
      const knee = shape.legs[side === -1 ? 0 : 1].joints[1]!;
      const t = (hem - hip.y) / (knee.y - hip.y);
      return hip.x + (knee.x - hip.x) * t;
    };
    const shorts = path([
      `M ${cx - w} ${bottom - 4}`,
      `L ${cx + w} ${bottom - 4}`,
      `L ${legHem(1) + thigh + 2} ${hem}`,
      `L ${cx + 1.5} ${hem}`,
      `L ${cx} ${bottom + 8}`,
      `L ${cx - 1.5} ${hem}`,
      `L ${legHem(-1) - thigh - 2} ${hem}`,
      "Z",
    ]);
    outfit = { top: topPath, shorts };
  }

  const wristbands = has.has("wristbands")
    ? shape.arms.map((arm) => {
        const elbow = arm.joints[1]!;
        const wrist = arm.joints[2]!;
        const fore = arm.muscles[1]?.halfWidth ?? 0;
        return band({ from: lerp(elbow, wrist, 0.72), to: lerp(elbow, wrist, 0.9), halfWidth: fore * 0.6 + 2.5 });
      })
    : [];

  let headband: ExtrasShape["headband"] = null;
  if (has.has("headband")) {
    const y1 = HEAD.cy - 16;
    const y2 = HEAD.cy - 10;
    const dx = (y: number) => Math.sqrt(HEAD.r ** 2 - (y - HEAD.cy) ** 2);
    headband = {
      band: path([
        `M ${cx - dx(y1)} ${y1}`,
        `L ${cx + dx(y1)} ${y1}`,
        `L ${cx + dx(y2)} ${y2}`,
        `L ${cx - dx(y2)} ${y2}`,
        "Z",
      ]),
      // Two short tails behind the right side of the head.
      knot: path([
        `M ${cx + dx(y2) - 1} ${y1 + 2}`,
        `L ${cx + dx(y2) + 9} ${y1 + 1}`,
        `M ${cx + dx(y2) - 1} ${y2 - 1}`,
        `L ${cx + dx(y2) + 7} ${y2 + 6}`,
      ]),
    };
  }

  return { cape, clasp, outfit, wristbands, headband };
}

/** A five-pointed star centred on (x, y), point up. */
function star(x: number, y: number, r: number): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${x + radius * Math.cos(angle)} ${y + radius * Math.sin(angle)}`;
  });
  return path([`M ${points[0]}`, ...points.slice(1).map((p) => `L ${p}`), "Z"]);
}

/** A band across a bone: a rectangle `halfWidth` either side of it. */
function band({ from, to, halfWidth }: { from: Point; to: Point; halfWidth: number }): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const nx = (-dy / length) * halfWidth;
  const ny = (dx / length) * halfWidth;
  return path([
    `M ${from.x + nx} ${from.y + ny}`,
    `L ${to.x + nx} ${to.y + ny}`,
    `L ${to.x - nx} ${to.y - ny}`,
    `L ${from.x - nx} ${from.y - ny}`,
    "Z",
  ]);
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Joins path commands, rounding every number to 2 decimals so paths stay short and stable. */
const path = (parts: string[]) =>
  parts.join(" ").replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 100) / 100));
