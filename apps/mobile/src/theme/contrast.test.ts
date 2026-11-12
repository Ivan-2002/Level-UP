import { contrastRatio, parseColor } from "./contrast";
import { palettes, type ColorScheme, type Palette } from "./tokens";

type Key = keyof Palette;

// Every pairing the screens use. Adding a new pairing to a component? Add it here.
const TEXT_PAIRS: [fg: Key, bg: Key][] = [
  // Body and secondary text on every surface.
  ...(["ink", "inkMuted"] as const).flatMap((fg) => (["bg", "surface", "surfaceRaised"] as const).map((bg) => [fg, bg] as [Key, Key])),
  // Coloured text: XP numbers, links, statuses.
  ...(["purple", "ice", "success", "warning", "danger"] as const).flatMap((fg) =>
    (["bg", "surface", "surfaceRaised"] as const).map((bg) => [fg, bg] as [Key, Key]),
  ),
  ["onPrimary", "primary"], // primary button, selected chip
  ["purple", "purpleSoft"], // PR chip, level badge
];

// Non-text: icons and the edges of controls you must be able to find (WCAG 1.4.11).
const NON_TEXT_PAIRS: [fg: Key, bg: Key][] = [
  ["onSuccess", "success"], // the tick on a completed set
  ["inkMuted", "surface"], // the empty tick circle (see SetRow)
  ["success", "surface"], // the filled tick circle
];

describe.each<ColorScheme>(["dark", "light"])("%s theme contrast", (scheme) => {
  const c = palettes[scheme];

  it.each(TEXT_PAIRS)("%s text on %s is at least 4.5:1", (fg, bg) => {
    expect(contrastRatio(parseColor(c[fg]), parseColor(c[bg]))).toBeGreaterThanOrEqual(4.5);
  });

  it("success text on a completed set row (tinted surface) is at least 4.5:1", () => {
    const row = parseColor(c.successTint, c.surface);
    expect(contrastRatio(parseColor(c.success), row)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(parseColor(c.ink), row)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)("%s on %s is at least 3:1", (fg, bg) => {
    expect(contrastRatio(parseColor(c[fg]), parseColor(c[bg]))).toBeGreaterThanOrEqual(3);
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio(parseColor("#000000"), parseColor("#FFFFFF"))).toBeCloseTo(21, 5);
    expect(contrastRatio(parseColor("#777777"), parseColor("#FFFFFF"))).toBeCloseTo(4.48, 2);
  });

  it("blends translucent colours over what they sit on", () => {
    expect(parseColor("rgba(0, 0, 0, 0.5)", "#FFFFFF")).toEqual([128, 128, 128]);
    expect(() => parseColor("rgba(0, 0, 0, 0.5)")).toThrow("translucent");
  });

  it("would have caught the original light purple on the PR chip", () => {
    expect(contrastRatio(parseColor("#6D5AE6"), parseColor("#E7E3FF"))).toBeLessThan(4.5);
  });
});
