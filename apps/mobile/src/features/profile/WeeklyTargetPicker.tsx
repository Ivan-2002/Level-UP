import { Pressable, View } from "react-native";
import { WEEKLY_TARGET_MAX, WEEKLY_TARGET_MIN } from "@levelup/shared";
import { Text } from "@/components/Text";
import { createStyles } from "@/theme/use-theme";

// The range comes from @levelup/shared, so the buttons always match what the API accepts.
const OPTIONS = Array.from(
  { length: WEEKLY_TARGET_MAX - WEEKLY_TARGET_MIN + 1 },
  (_, i) => WEEKLY_TARGET_MIN + i,
);

type Props = {
  value: number;
  onChange: (value: number) => void;
  hint?: string;
};

// "Workouts per week" as a row of number buttons. It's a single choice, so screen readers
// get radio semantics: "3, radio button, selected, 2 of 5".
export function WeeklyTargetPicker({ value, onChange, hint }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.wrapper}>
      <Text variant="label" nativeID="weekly-target-label">
        Weekly target
      </Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabelledBy="weekly-target-label">
        {OPTIONS.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option} workouts per week`}
              onPress={() => onChange(option)}
              style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
            >
              <Text variant="heading" tone={selected ? "onPrimary" : "ink"} tabular>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? (
        <Text variant="caption" tone="inkMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  wrapper: { gap: t.space[2] },
  row: { flexDirection: "row", gap: t.space[2] },
  option: {
    flex: 1,
    height: 48,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
  pressed: { opacity: 0.7 },
}));
