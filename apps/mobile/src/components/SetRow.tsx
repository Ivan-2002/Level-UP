import { useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import type { WeightUnit } from "@levelup/shared";
import { createStyles, useTheme } from "@/theme/use-theme";
import { TAP_TARGET } from "@/theme/tokens";
import { Icon } from "./Icon";
import { Text } from "./Text";

// One row of the set table: Set | Last week | kg | Reps | tick.
// It only SHOWS a set and reports edits: what a value means (parsing "62,5", converting
// lb to kg, starting the rest timer when ticked) is up to the screen that uses it.
//
// The table header and the rows share COLUMNS, so they always line up.

type RepsUnit = "reps" | "seconds";

const COLUMNS = { set: 32, weight: 72, reps: 60, done: TAP_TARGET, gap: 8 } as const;

export function SetTableHeader({
  weightUnit,
  repsUnit,
  previousLabel,
}: {
  weightUnit: WeightUnit;
  repsUnit: RepsUnit;
  /** "Last week": omit to hide the column (no history yet). */
  previousLabel?: string;
}) {
  const styles = useStyles();
  const flexible = previousLabel === undefined;
  return (
    // Hidden from screen readers: each input already says "Set 2 weight in kg".
    <View style={[styles.grid, styles.header]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Text variant="caption" tone="inkMuted" style={styles.setColumn}>
        Set
      </Text>
      {previousLabel !== undefined ? (
        <Text variant="caption" tone="inkMuted" style={styles.previousColumn} numberOfLines={1}>
          {previousLabel}
        </Text>
      ) : null}
      <Text variant="caption" tone="inkMuted" style={[flexible ? styles.flexColumn : styles.weightColumn, styles.centered]}>
        {weightUnit}
      </Text>
      <Text variant="caption" tone="inkMuted" style={[flexible ? styles.flexColumn : styles.repsColumn, styles.centered]}>
        {repsUnit === "seconds" ? "Sec" : "Reps"}
      </Text>
      <View style={styles.doneColumn} />
    </View>
  );
}

type SetRowProps = {
  number: number;
  /** Last session's set, e.g. "60 × 8". Omit to hide the column (match SetTableHeader). */
  previous?: string;
  /** What's typed, in the player's unit. Kept as text so "62." can be typed on the way to "62.5". */
  weight: string;
  reps: string;
  onChangeWeight: (text: string) => void;
  onChangeReps: (text: string) => void;
  weightUnit: WeightUnit;
  repsUnit: RepsUnit;
  /** Bodyweight exercises log ADDED weight, so the input is labelled that way. */
  bodyweight?: boolean;
  done: boolean;
  onToggleDone: () => void;
  /** "New PR · est. 1RM 79 kg": shown in purple under the row. */
  prText?: string;
  /** Why the tick was refused, e.g. "Enter reps first." */
  error?: string;
  /** Tapping the set number (e.g. to remove the set). */
  onPressNumber?: () => void;
  numberHint?: string;
};

export function SetRow(props: SetRowProps) {
  const { number, previous, weight, reps, weightUnit, repsUnit, bodyweight = false, done, prText, error } = props;
  const styles = useStyles();
  const t = useTheme();
  const flexible = previous === undefined;
  const weightName = bodyweight ? `added weight in ${weightUnit}` : `weight in ${weightUnit}`;

  const numberBadge = (
    <View style={styles.badge}>
      <Text variant="labelStrong" tone={done ? "success" : "ink"} tabular>
        {number}
      </Text>
    </View>
  );

  return (
    <View style={[styles.row, done && styles.rowDone]}>
      <View style={styles.grid}>
        {props.onPressNumber ? (
          <Pressable
            onPress={props.onPressNumber}
            accessibilityRole="button"
            accessibilityLabel={`Set ${number}`}
            accessibilityHint={props.numberHint}
            hitSlop={6}
            style={styles.setColumn}
          >
            {numberBadge}
          </Pressable>
        ) : (
          <View style={styles.setColumn}>{numberBadge}</View>
        )}

        {previous !== undefined ? (
          <Text variant="label" tone="inkMuted" tabular numberOfLines={1} style={styles.previousColumn} accessibilityLabel={`Last time ${previous}`}>
            {previous}
          </Text>
        ) : null}

        <NumberInput
          value={weight}
          onChangeText={props.onChangeWeight}
          keyboardType="decimal-pad"
          maxLength={7}
          accessibilityLabel={`Set ${number} ${weightName}`}
          style={flexible ? styles.flexColumn : styles.weightColumn}
        />
        <NumberInput
          value={reps}
          onChangeText={props.onChangeReps}
          keyboardType="number-pad"
          maxLength={3}
          accessibilityLabel={`Set ${number} ${repsUnit}`}
          style={flexible ? styles.flexColumn : styles.repsColumn}
        />

        <Pressable
          onPress={props.onToggleDone}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={`Set ${number} done`}
          style={({ pressed }) => [styles.tick, done ? styles.tickOn : styles.tickOff, pressed && styles.pressed]}
        >
          {done ? <Icon name="check" size={20} strokeWidth={2.5} color={t.colors.onSuccess} /> : null}
        </Pressable>
      </View>

      {prText ? (
        <View style={styles.note} accessibilityLiveRegion="polite">
          <Icon name="pr" size={14} color={t.colors.purple} />
          <Text variant="captionStrong" tone="purple" tabular>
            {prText}
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text variant="caption" tone="danger" style={styles.noteText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function NumberInput({ style, ...props }: TextInputProps) {
  const styles = useStyles();
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      placeholder="0"
      placeholderTextColor={t.colors.inkMuted}
      selectTextOnFocus // typing replaces the pre-filled number instead of appending to it
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.input, focused && styles.inputFocused, style]}
    />
  );
}

const useStyles = createStyles((t) => ({
  row: { borderRadius: t.radius.md, padding: 6 },
  rowDone: { backgroundColor: t.colors.successTint },
  grid: { flexDirection: "row", alignItems: "center", gap: COLUMNS.gap },
  header: { paddingHorizontal: 6 },
  setColumn: { width: COLUMNS.set, alignItems: "center" },
  previousColumn: { flex: 1, minWidth: 0 },
  weightColumn: { width: COLUMNS.weight },
  repsColumn: { width: COLUMNS.reps },
  flexColumn: { flex: 1 },
  doneColumn: { width: COLUMNS.done },
  centered: { textAlign: "center" },
  badge: {
    width: 28,
    height: 28,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    ...t.type.input,
    fontVariant: ["tabular-nums"],
    height: TAP_TARGET,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceRaised,
    color: t.colors.ink,
    textAlign: "center",
    paddingHorizontal: 0,
    paddingVertical: 0, // Android adds vertical padding by default, clipping the digits
  },
  inputFocused: { borderColor: t.colors.ice }, // ice = focus ring
  tick: { width: TAP_TARGET, height: TAP_TARGET, borderRadius: t.radius.pill, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  tickOn: { backgroundColor: t.colors.success, borderColor: t.colors.success },
  // The design draws the empty circle in `border` (1.4:1), too faint to find in a bright
  // gym; inkMuted passes the 3:1 rule for controls (see theme/contrast.test.ts).
  tickOff: { backgroundColor: "transparent", borderColor: t.colors.inkMuted },
  pressed: { opacity: 0.7 },
  note: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 4, paddingLeft: COLUMNS.set + COLUMNS.gap },
  noteText: { paddingTop: 4, paddingLeft: COLUMNS.set + COLUMNS.gap },
}));
