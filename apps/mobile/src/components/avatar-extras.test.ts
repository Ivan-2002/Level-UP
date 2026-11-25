import { CAPE_FLARE, extrasShape, KNOWN_EXTRAS, knownExtras, SHORTS_HEM_Y } from "./avatar-extras";
import { avatarShape, ZERO_DEVELOPMENT } from "./avatar-shape";

const stick = avatarShape(ZERO_DEVELOPMENT);
const strong = avatarShape({ chest: 0.8, back: 0.9, shoulders: 0.7, arms: 0.8, core: 0.3, legs: 0.9 });

describe("extras", () => {
  it("no extras draws nothing", () => {
    expect(extrasShape(stick, [])).toEqual({ cape: null, clasp: null, outfit: null, wristbands: [], headband: null });
  });

  it("ignores extras this app doesn't know (a newer server's)", () => {
    expect(knownExtras(["wristbands", "jetpack", "cape"])).toEqual(["wristbands", "cape"]);
    expect(extrasShape(stick, ["jetpack"])).toEqual(extrasShape(stick, []));
  });

  it.each([
    ["stick", stick],
    ["developed", strong],
  ] as const)("draws every known extra on a %s body", (_, body) => {
    const all = extrasShape(body, KNOWN_EXTRAS);
    expect(all.cape).not.toBeNull();
    expect(all.outfit).not.toBeNull();
    expect(all.wristbands).toHaveLength(2);
    expect(all.headband).not.toBeNull();
  });

  it("the outfit and wristbands follow the body: wider on a developed one", () => {
    const thin = extrasShape(stick, ["outfit", "wristbands"]);
    const wide = extrasShape(strong, ["outfit", "wristbands"]);
    expect(wide.outfit!.top).not.toEqual(thin.outfit!.top);
    expect(wide.wristbands).not.toEqual(thin.wristbands);
  });

  it("each extra is independent of the others", () => {
    const capeOnly = extrasShape(strong, ["cape"]);
    expect(capeOnly.cape).toEqual(extrasShape(strong, KNOWN_EXTRAS).cape);
    expect(capeOnly.clasp).toEqual(extrasShape(strong, KNOWN_EXTRAS).clasp);
    expect(capeOnly.outfit).toBeNull();
  });

  /** Every y coordinate in a path (all its commands take x y pairs). */
  const ys = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);

  /** Every x coordinate in a path. */
  const xs = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0);

  it.each([
    ["stick", stick],
    ["developed", strong],
  ] as const)("the cape reaches mid-calf and flares past the shoulders on both sides, on a %s body", (_, body) => {
    const { cape, clasp } = extrasShape(body, ["cape"]);
    const [, knee, foot] = body.legs[0].joints;
    const hem = Math.max(...ys(cape!));
    expect(hem).toBeGreaterThan(knee!.y + 10); // well below the knee ...
    expect(hem).toBeLessThan(foot!.y - 10); // ... and above the foot: mid-calf
    const shoulders = [body.arms[0].joints[0]!.x, body.arms[1].joints[0]!.x];
    expect(Math.min(...xs(cape!))).toBeLessThanOrEqual(shoulders[0]! - CAPE_FLARE + 0.01);
    expect(Math.max(...xs(cape!))).toBeGreaterThanOrEqual(shoulders[1]! + CAPE_FLARE - 0.01);
    expect(clasp).not.toBeNull();
  });

  it("the shorts' hem is above the thigh's bulge, so they never hide the legs' development", () => {
    const thigh = strong.legs[0].muscles[0]!;
    const peakY = thigh.from.y + (thigh.to.y - thigh.from.y) * thigh.peak;
    expect(SHORTS_HEM_Y).toBeLessThan(peakY);
    expect(Math.max(...ys(extrasShape(strong, ["outfit"]).outfit!.shorts))).toBeLessThanOrEqual(SHORTS_HEM_Y);
  });
});
