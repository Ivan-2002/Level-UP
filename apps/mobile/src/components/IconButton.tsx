import { Pressable } from "react-native";
import { createStyles, useTheme } from "@/theme/use-theme";
import { TAP_TARGET } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";

type Props = {
  icon: IconName;
  /** Required: an icon alone says nothing to a screen reader. */
  accessibilityLabel: string;
  onPress: () => void;
  accessibilityHint?: string;
  /** bordered = the design's 44 px square tile (back, history); plain = just the icon. */
  variant?: "bordered" | "plain";
  disabled?: boolean;
};

/** A 44 x 44 icon-only button. */
export function IconButton({ icon, accessibilityLabel, accessibilityHint, onPress, variant = "bordered", disabled = false }: Props) {
  const styles = useStyles();
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.base, variant === "bordered" && styles.bordered, (pressed || disabled) && styles.dimmed]}
    >
      <Icon name={icon} color={disabled ? t.colors.inkMuted : t.colors.ink} />
    </Pressable>
  );
}

const useStyles = createStyles((t) => ({
  base: { width: TAP_TARGET, height: TAP_TARGET, borderRadius: t.radius.md, alignItems: "center", justifyContent: "center" },
  bordered: { borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surfaceRaised },
  dimmed: { opacity: 0.6 },
}));
