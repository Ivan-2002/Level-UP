import { Pressable, View } from "react-native";
import { createStyles, useTheme } from "@/theme/use-theme";
import { TAP_TARGET } from "@/theme/tokens";
import { Icon } from "./Icon";
import { Text } from "./Text";

type Props = {
  label: string;
  /** What's shown and read out, e.g. "3" or "2:00". */
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease?: boolean;
  canIncrease?: boolean;
  /** A muted line under the label, e.g. "Suggested for compound lifts". */
  hint?: string;
};

/**
 * "Label   −  value  +". For screen readers the whole row is ONE adjustable control
 * ("Rest, 2:00, adjustable: swipe up or down"), instead of two unlabelled buttons and a number.
 */
export function Stepper({ label, value, onDecrease, onIncrease, canDecrease = true, canIncrease = true, hint }: Props) {
  const styles = useStyles();
  const t = useTheme();
  const button = (icon: "minus" | "plus", enabled: boolean, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Icon name={icon} size={18} strokeWidth={2} color={enabled ? t.colors.ink : t.colors.border} />
    </Pressable>
  );

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityValue={{ text: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment" && canIncrease) onIncrease();
        if (event.nativeEvent.actionName === "decrement" && canDecrease) onDecrease();
      }}
    >
      <View style={styles.labels}>
        <Text variant="labelStrong">{label}</Text>
        {hint ? (
          <Text variant="caption" tone="inkMuted">
            {hint}
          </Text>
        ) : null}
      </View>
      {button("minus", canDecrease, onDecrease)}
      <Text variant="heading" tabular style={styles.value}>
        {value}
      </Text>
      {button("plus", canIncrease, onIncrease)}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 2, paddingLeft: t.space[3], paddingRight: 6, paddingVertical: 2, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceRaised },
  labels: { flex: 1, minWidth: 0 },
  button: { width: TAP_TARGET, height: TAP_TARGET, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pressed: { backgroundColor: t.colors.surface },
  value: { minWidth: 48, textAlign: "center" },
}));
