import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { createStyles, useTheme } from "@/theme/use-theme";
import { TAP_TARGET } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Text, type TextTone } from "./Text";

export type ButtonVariant =
  /** Filled indigo: the ONE main action on a screen. */
  | "primary"
  /** Raised and bordered: a strong secondary action ("Finish", "+30s"). */
  | "secondary"
  /** Bordered on the background: a quiet action ("Skip", "Add exercise"). */
  | "outline"
  /** Dashed border: adds a row to the list above it ("+ Add set"). */
  | "dashed"
  /** Text only: a minor or destructive action that shouldn't draw the eye ("Discard workout"). */
  | "plain";

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** lg = 52 px (full-width screen actions), md = 44 px (actions inside cards and bars). */
  size?: "lg" | "md";
  /** Label colour for non-primary buttons: "link" (ice) for navigation, "danger" for destructive. */
  tone?: "default" | "link" | "danger";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

// The app's one button. Every screen uses it, so buttons look and behave the same
// everywhere, and a design change happens here once.
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  tone = "default",
  icon,
  loading = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: Props) {
  const styles = useStyles();
  const t = useTheme();
  const inactive = disabled || loading;
  const textTone: TextTone = variant === "primary" ? "onPrimary" : tone === "link" ? "ice" : tone === "danger" ? "danger" : "ink";
  const color = t.colors[textTone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        size === "lg" ? styles.lg : styles.md,
        styles[variant],
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={size === "lg" ? 20 : 16} color={color} /> : null}
          <Text variant={size === "lg" ? "button" : "labelStrong"} tone={textTone}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = createStyles((t) => ({
  base: { borderRadius: t.radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: t.space[4] },
  lg: { minHeight: 52 },
  md: { minHeight: TAP_TARGET, paddingHorizontal: t.space[3] },
  content: { flexDirection: "row", alignItems: "center", gap: 6 },
  primary: { backgroundColor: t.colors.primary },
  secondary: { backgroundColor: t.colors.surfaceRaised, borderWidth: 1, borderColor: t.colors.border },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: t.colors.border },
  dashed: { backgroundColor: "transparent", borderWidth: 1, borderStyle: "dashed", borderColor: t.colors.border },
  plain: { backgroundColor: "transparent" },
  pressed: { opacity: 0.7 },
  inactive: { opacity: 0.5 },
}));
