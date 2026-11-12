import { Pressable, View } from "react-native";
import { createStyles, useTheme } from "@/theme/use-theme";
import { TAP_TARGET } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

// Three kinds of chip, one file: they share size and shape, and differ in meaning.
// - Chip:     a choice you tap (exercise tabs, muscle-group filters).
// - AddChip:  the dashed "+ Add" at the end of a row of chips.
// - InfoChip: a read-only fact ("Last week 60 kg x 8, 8, 7"), purple when it is progress (a PR).

// Chips are 36 px tall to fit in a row, but a tap target must be 44 px: hitSlop extends
// the touchable area 4 px above and below without changing the layout.
const CHIP_HEIGHT = 36;
const hitSlop = { top: (TAP_TARGET - CHIP_HEIGHT) / 2, bottom: (TAP_TARGET - CHIP_HEIGHT) / 2 };

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** "2/4": sets done of the planned sets. */
  count?: string;
  /** Shows a tick before the label (every set of that exercise is done). */
  done?: boolean;
  /** How a screen reader announces it: radio (pick one), checkbox (pick many), tab. */
  role?: "radio" | "checkbox" | "tab" | "button";
  accessibilityLabel?: string;
};

export function Chip({ label, selected, onPress, count, done = false, role = "button", accessibilityLabel }: ChipProps) {
  const styles = useStyles();
  const t = useTheme();
  // On the indigo fill, everything is white: muted grey and green both fail contrast there.
  const accent = selected ? t.colors.onPrimary : t.colors.success;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? (count ? `${label}, ${count}` : label)}
      accessibilityState={role === "checkbox" ? { checked: selected } : { selected }}
      style={({ pressed }) => [styles.chip, selected ? styles.selected : styles.unselected, pressed && styles.pressed]}
    >
      {done ? <Icon name="check" size={14} strokeWidth={2.25} color={accent} /> : null}
      <Text variant="label" tone={selected ? "onPrimary" : "ink"} numberOfLines={1}>
        {label}
      </Text>
      {count ? (
        <Text variant="caption" tone={selected ? "onPrimary" : "inkMuted"} tabular>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function AddChip({ label = "Add", onPress, accessibilityLabel }: { label?: string; onPress: () => void; accessibilityLabel: string }) {
  const styles = useStyles();
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.chip, styles.add, pressed && styles.pressed]}
    >
      <Icon name="plus" size={14} strokeWidth={2} color={t.colors.ice} />
      <Text variant="labelStrong" tone="ice">
        {label}
      </Text>
    </Pressable>
  );
}

type InfoChipProps = {
  /** Muted lead-in, e.g. "Last week". */
  label?: string;
  value: string;
  /** "progress" = purple, for PRs and XP only. */
  tone?: "neutral" | "progress";
  icon?: IconName;
};

export function InfoChip({ label, value, tone = "neutral", icon }: InfoChipProps) {
  const styles = useStyles();
  const t = useTheme();
  const progress = tone === "progress";
  return (
    <View
      style={[styles.info, progress ? styles.infoProgress : styles.infoNeutral]}
      accessible
      accessibilityLabel={label ? `${label}: ${value}` : value}
    >
      {icon ? <Icon name={icon} size={14} color={progress ? t.colors.purple : t.colors.inkMuted} /> : null}
      {label ? (
        <Text variant="caption" tone={progress ? "purple" : "inkMuted"}>
          {label}
        </Text>
      ) : null}
      <Text variant="captionStrong" tone={progress ? "purple" : "ink"} tabular>
        {value}
      </Text>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: t.space[3],
    borderRadius: t.radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: t.space[2],
  },
  selected: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
  unselected: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
  add: { borderStyle: "dashed", borderColor: t.colors.border, backgroundColor: "transparent", gap: 6 },
  pressed: { opacity: 0.7 },
  info: { height: 28, paddingHorizontal: 10, borderRadius: t.radius.sm, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  infoNeutral: { backgroundColor: t.colors.surfaceRaised },
  infoProgress: { backgroundColor: t.colors.purpleSoft },
}));
