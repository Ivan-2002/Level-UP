import { View } from "react-native";
import { formatWeight, type WeightUnit } from "@levelup/shared";
import { Text } from "@/components/Text";
import { createStyles, useTheme } from "@/theme/use-theme";
import type { ChartBar } from "./live-workout";

const MAX_BAR = 52;
const MIN_BAR = 12;

/** Estimated 1RM: the last sessions and today, today's bar purple when it's a PR. */
export function E1rmChart({ bars, unit }: { bars: ChartBar[]; unit: WeightUnit }) {
  const styles = useStyles();
  const t = useTheme();
  const values = bars.map((b) => b.value).filter((v): v is number => v !== null);
  if (values.length === 0) return null;

  // Scale from a little below the lowest value, so small gains are visible.
  const lo = Math.min(...values) * 0.97;
  const hi = Math.max(...values);
  const height = (v: number) => MIN_BAR + Math.round(((v - lo) / Math.max(1, hi - lo)) * (MAX_BAR - MIN_BAR));
  const show = (v: number) => formatWeight(v, unit, { decimals: 0 }).replace(` ${unit}`, "");
  const fill = (b: ChartBar) => (b.tone === "today_pr" ? t.colors.purple : b.tone === "today" ? t.colors.primary : t.colors.border);
  const summary = bars.map((b) => `${b.label} ${b.value === null ? "none yet" : formatWeight(b.value, unit, { decimals: 0 })}`).join(", ");

  return (
    <View style={styles.wrap}>
      <Text variant="labelStrong">Estimated 1RM trend</Text>
      <View style={styles.row} accessible accessibilityRole="image" accessibilityLabel={`Estimated one-rep max: ${summary}`}>
        {bars.map((bar, index) => (
          <View key={index} style={styles.column}>
            <Text variant="captionStrong" tone={bar.tone === "today_pr" ? "purple" : bar.tone === "today" ? "ink" : "inkMuted"} tabular>
              {bar.value === null ? "—" : show(bar.value)}
            </Text>
            <View style={[styles.bar, { height: bar.value === null ? 4 : height(bar.value), backgroundColor: bar.value === null ? t.colors.surfaceRaised : fill(bar) }]} />
            <Text variant="caption" tone="inkMuted" numberOfLines={1}>
              {bar.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  wrap: { gap: t.space[2], borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: t.space[3] },
  row: { flexDirection: "row", alignItems: "flex-end", gap: t.space[2] },
  column: { flex: 1, alignItems: "center", gap: t.space[1] },
  bar: { width: "100%", borderRadius: 6 },
}));
