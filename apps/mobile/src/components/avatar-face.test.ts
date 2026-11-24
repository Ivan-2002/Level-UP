import { SKIN_TONES } from "@/theme/tokens";
import {
  DEFAULT_FACE,
  EXPRESSIONS,
  FACE_PRESETS,
  FACE_SLOTS,
  facePoints,
  faceShape,
  resolveFace,
  type Face,
} from "./avatar-face";
import { HEAD } from "./avatar-shape";

/** Every combination of presets (2^5 today). */
function allFaces(): Face[] {
  return FACE_SLOTS.reduce<Face[]>(
    (faces, slot) => faces.flatMap((f) => FACE_PRESETS[slot].map((key) => ({ ...f, [slot]: key }) as Face)),
    [DEFAULT_FACE],
  );
}

describe("resolveFace", () => {
  it("fills every slot with its default when nothing is stored", () => {
    expect(resolveFace(undefined)).toEqual(DEFAULT_FACE);
    expect(resolveFace(null)).toEqual(DEFAULT_FACE);
    expect(resolveFace({})).toEqual(DEFAULT_FACE);
  });

  it("keeps known keys, falls back on unknown ones (a newer app's preset), and ignores unknown slots", () => {
    const face = resolveFace({ hair: "short", eyes: "laser", mouth: 3, beard: "full" });
    expect(face).toEqual({ ...DEFAULT_FACE, hair: "short" });
  });

  it("the default is each slot's first preset", () => {
    for (const slot of FACE_SLOTS) expect(DEFAULT_FACE[slot]).toBe(FACE_PRESETS[slot][0]);
  });
});

describe("faceShape", () => {
  it.each(EXPRESSIONS)("every preset combination stays inside the head (%s)", (expression) => {
    for (const face of allFaces()) {
      for (const p of facePoints(faceShape(face, expression))) {
        // Hair follows the head's outline exactly; everything else keeps 2 units inside it.
        const distance = Math.hypot(p.x - HEAD.cx, p.y - HEAD.cy);
        expect(distance).toBeLessThanOrEqual(HEAD.r + 0.01);
      }
      const inner = faceShape({ ...face, hair: "none" }, expression);
      for (const p of facePoints(inner))
        expect(Math.hypot(p.x - HEAD.cx, p.y - HEAD.cy)).toBeLessThanOrEqual(HEAD.r - 2);
    }
  });

  it("proud bends the chosen face: the brows rise and the mouth curves more", () => {
    const face: Face = { ...DEFAULT_FACE, brows: "flat" };
    const neutral = faceShape(face, "neutral");
    const proud = faceShape(face, "proud");
    expect(proud.brows[0]!.to.y).toBeLessThan(neutral.brows[0]!.to.y);
    const depth = (s: typeof neutral) => s.mouth.curve.control.y - s.mouth.curve.from.y;
    expect(depth(proud)).toBeGreaterThan(depth(neutral));
    expect(proud.eyes).toEqual(neutral.eyes); // the chosen eyes stay
  });

  it("every skin tone preset has a colour token", () => {
    for (const tone of FACE_PRESETS.skinTone.filter((t) => t !== "none")) expect(SKIN_TONES).toHaveProperty(tone);
  });
});
