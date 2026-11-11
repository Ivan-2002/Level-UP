import Svg, { Circle, Path } from "react-native-svg";

// The few stroke icons the design uses, drawn with react-native-svg (already installed
// for the avatar) instead of adding an icon font. Paths match the design's 24x24 icons.
const paths = {
  check: ["M20 6L9 17l-5-5"],
  plus: ["M12 5v14M5 12h14"],
  back: ["M15 18l-6-6 6-6"],
  forward: ["M9 18l6-6-6-6"],
  close: ["M18 6L6 18M6 6l12 12"],
  dumbbell: ["M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"],
  search: ["M21 21l-4.35-4.35", "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z"],
  sync: ["M21 12a9 9 0 0 1-15.5 6.2L3 16", "M3 12a9 9 0 0 1 15.5-6.2L21 8", "M21 3v5h-5", "M3 21v-5h5"],
  alert: ["M12 9v4", "M12 17h.01", "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"],
} as const;

export type IconName = keyof typeof paths | "more";

type Props = { name: IconName; size?: number; color: string; strokeWidth?: number };

/** Decorative by default: give the surrounding button an accessibilityLabel instead. */
export function Icon({ name, size = 20, color, strokeWidth = 2 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === "more" ? (
        [5, 12, 19].map((cx) => <Circle key={cx} cx={cx} cy={12} r={1.75} fill={color} />)
      ) : (
        paths[name].map((d) => (
          <Path key={d} d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        ))
      )}
    </Svg>
  );
}
