import type { ReactNode } from "react";
import { View } from "react-native";
import { createStyles, useTheme } from "@/theme/use-theme";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

type Props = {
  label: string;
  /** The big number. A string, or a live element such as a ticking timer. */
  value: ReactNode;
  /** Smaller muted text after the value: " / 18". */
  suffix?: string;
  icon?: IconName;
  /** "progress" turns the value and icon purple (XP earned). */
  tone?: "neutral" | "progress";
  /** What a screen reader says, e.g. "Sets left, 12 of 18". Defaults to label + value. */
  accessibilityLabel?: string;
};

/** A small labelled number: "Elapsed 42:18", "Sets left 12 / 18", "XP earned +181". */
export function StatTile({ label, value, suffix, icon, tone = "neutral", accessibilityLabel }: Props) {
  const styles = useStyles();
  const t = useTheme();
  const progress = tone === "progress";

  return (
    <View
      style={styles.tile}
      accessible
      accessibilityLabel={accessibilityLabel ?? (typeof value === "string" ? `${label}, ${value}${suffix ?? ""}` : label)}
    >
      <View style={styles.labelRow}>
        {icon ? <Icon name={icon} size={14} color={progress ? t.colors.purple : t.colors.inkMuted} /> : null}
        <Text variant="caption" tone="inkMuted" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="value" tone={progress ? "purple" : "ink"} tabular numberOfLines={1}>
        {value}
        {suffix ? (
          <Text variant="labelStrong" tone="inkMuted">
            {suffix}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  tile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
    borderWidth: 1,
    borderRadius: t.radius.md,
    paddingVertical: t.space[2],
    paddingHorizontal: t.space[3],
    gap: 2,
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: t.space[1] },
}));
