import { extrasShape, KNOWN_EXTRAS, knownExtras } from "./avatar-extras";
import { avatarShape, ZERO_DEVELOPMENT } from "./avatar-shape";

const stick = avatarShape(ZERO_DEVELOPMENT);
const strong = avatarShape({ chest: 0.8, back: 0.9, shoulders: 0.7, arms: 0.8, core: 0.3, legs: 0.9 });

describe("extras", () => {
  it("no extras draws nothing", () => {
    expect(extrasShape(stick, [])).toEqual({ cape: null, outfit: null, wristbands: [], headband: null });
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
    expect(capeOnly.outfit).toBeNull();
  });
});
