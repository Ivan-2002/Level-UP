import { BODY_PARTS } from "@levelup/shared";
import type { Development } from "./avatar-shape";

// The avatar's front-loading (docs/ARCHITECTURE.md, "Avatar prototype": where the
// front-loading happens). The development RULE (packages/shared) is slow on purpose: a
// beginner needs about 14 weeks to reach 0.25. The DRAWING makes that early change visible:
// a part is drawn at development^FRONT_LOAD, so 0 to 0.25 already draws 44% of its size.
//
// This is a separate step, applied once by the Avatar component BEFORE any renderer, so a
// renderer maps its inputs from 0 to 1 linearly: avatarShape (SVG) today, a Rive file's
// number inputs later. Retuning FRONT_LOAD then never needs a new Rive file, and both
// renderers draw the same sizes for the same player. The summary's "grew" bars use it too,
// so a bar moves as much as the drawing does.

/** Tuned with the UI preview's "first 12 weeks" strip. */
export const FRONT_LOAD = 0.6;

/** 0 → 0, 1 → 1, monotonic, steep at the start. Outside 0 to 1 is clamped. */
export function growth(development: number): number {
  const d = Math.min(1, Math.max(0, development));
  return d === 0 ? 0 : d ** FRONT_LOAD;
}

/** Development as the renderer draws it: growth() for every body part. */
export function drawnDevelopment(development: Development): Development {
  return Object.fromEntries(BODY_PARTS.map((part) => [part, growth(development[part])])) as Development;
}
