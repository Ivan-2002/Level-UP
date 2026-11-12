import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { createStyles } from "@/theme/use-theme";

type Props = {
  children: ReactNode;
  /** Makes the whole card one button (e.g. "Up next"). Give it an accessibilityLabel. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Use sparingly: e.g. a danger border on a card that needs attention. */
  style?: StyleProp<ViewStyle>;
};

/**
 * A surface with a hairline border, 16 px radius and padding, and 12 px between its
 * children (the design's card). Borders, not shadows: shadows look muddy on a dark theme.
 */
export function Card({ children, onPress, accessibilityLabel, accessibilityHint, style }: Props) {
  const styles = useStyles();

  if (!onPress) {
    return (
      <View style={[styles.card, style]} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

const useStyles = createStyles((t) => ({
  card: {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
    borderWidth: 1,
    borderRadius: t.radius.lg,
    padding: t.space[4],
    gap: t.space[3],
  },
  pressed: { backgroundColor: t.colors.surfaceRaised },
}));
