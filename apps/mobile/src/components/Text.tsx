import { Text as NativeText, type TextProps } from "react-native";
import { useTheme } from "@/theme/use-theme";
import type { Palette, TypeVariant } from "@/theme/tokens";

export type TextTone = Extract<keyof Palette, "ink" | "inkMuted" | "onPrimary" | "purple" | "ice" | "success" | "warning" | "danger">;

type Props = TextProps & {
  /** A step of the type scale (theme/tokens.ts). Picks the font file, size and line height. */
  variant?: TypeVariant;
  tone?: TextTone;
  /**
   * Same-width digits, so a ticking timer or a changing count doesn't shift sideways.
   * Sora and Inter both ship the `tnum` OpenType feature this switches on.
   */
  tabular?: boolean;
};

// The app's text. React Native has no global "default font" setting, so every text goes
// through this component to get the design's fonts and colours. Style overrides still
// work (`style` is applied last), e.g. for textAlign.
export function Text({ variant = "body", tone = "ink", tabular = false, style, ...props }: Props) {
  const t = useTheme();
  return (
    <NativeText
      {...props}
      style={[t.type[variant], { color: t.colors[tone] }, tabular && { fontVariant: ["tabular-nums"] }, style]}
    />
  );
}
