import Svg, { Circle, Line, Path } from "react-native-svg";
import { useTheme } from "@/theme/use-theme";

// The stickman avatar, drawn as SVG in code (no art assets; see docs/ARCHITECTURE.md).
// For now it always draws the Rookie stage. In Milestone 6 it takes a stage config
// (stroke width, shoulder width, extras) and per-body-part development values,
// never a level, so the art stays separate from the game rules.
export function Avatar({ width = 104, height = 140 }: { width?: number; height?: number }) {
  const stroke = useTheme().colors.ink;
  return (
    <Svg width={width} height={height} viewBox="0 0 104 140" accessibilityRole="image" accessibilityLabel="Rookie stickman avatar">
      <Circle cx={52} cy={22} r={13} fill="none" stroke={stroke} strokeWidth={3} />
      <Line x1={52} y1={36} x2={52} y2={84} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      <Line x1={40} y1={46} x2={64} y2={46} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      <Path d="M40 46 L32 68 L34 88" fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M64 46 L72 68 L70 88" fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M52 84 L42 132" fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M52 84 L62 132" fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}
