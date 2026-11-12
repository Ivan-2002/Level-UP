// WCAG 2.x contrast ratio, used by the tests to prove every text/background pair the
// design uses is readable in both themes. Pure maths, no React Native.

type Rgb = [number, number, number];

/** "#RRGGBB" or "rgba(r, g, b, a)". A translucent colour is blended over `under`. */
export function parseColor(color: string, under?: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color);
  if (rgba) {
    const [r, g, b, a] = rgba.slice(1).map(Number) as [number, number, number, number];
    if (!under) throw new Error(`${color} is translucent: say what it sits on`);
    const base = parseColor(under);
    return [r, g, b].map((c, i) => Math.round(c * a + base[i]! * (1 - a))) as Rgb;
  }
  throw new Error(`Unsupported colour ${color}`);
}

function luminance([r, g, b]: Rgb): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** 1 (no contrast) to 21 (black on white). Text needs 4.5, icons and control edges 3. */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const [hi, lo] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
