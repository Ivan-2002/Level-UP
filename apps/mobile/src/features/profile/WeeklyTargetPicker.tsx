import { Pressable, StyleSheet, Text, View } from "react-native";
import { WEEKLY_TARGET_MAX, WEEKLY_TARGET_MIN } from "@levelup/shared";
import { colors } from "@/theme/colors";

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
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label} nativeID="weekly-target-label">
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
              <Text style={[styles.optionText, selected && styles.selectedText]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  label: { color: colors.ink, fontSize: 13, fontWeight: "500" },
  row: { flexDirection: "row", gap: 8 },
  option: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.7 },
  optionText: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  selectedText: { color: colors.onPrimary },
  hint: { color: colors.inkMuted, fontSize: 12, lineHeight: 16 },
});
