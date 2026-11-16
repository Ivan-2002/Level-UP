import { View } from "react-native";
import { createStyles, useTheme } from "@/theme/use-theme";
import { layoutSegments, segmentTotals, type Segment, type SegmentTone } from "./progress-segments";

type Props = {
  segments: Segment[];
  currentIndex: number;
  /** What a screen reader says; defaults to "3 of 11 sets completed". */
  accessibilityLabel?: string;
};

/** The workout's progress bar: one segment per exercise (rules in progress-segments.ts). */
export function ProgressSegments({ segments, currentIndex, accessibilityLabel }: Props) {
  const styles = useStyles();
  const t = useTheme();
  const fills: Record<SegmentTone, string> = { complete: t.colors.success, current: t.colors.primary, other: t.colors.inkMuted };
  const { done, total } = segmentTotals(segments);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `${done} of ${total} sets completed`}
      accessibilityValue={{ min: 0, max: total, now: done }}
    >
      {layoutSegments(segments, currentIndex).map((segment, index) => (
        <View key={index} style={[styles.track, { flexGrow: segment.grow }]}>
          <View style={[styles.fill, { width: `${segment.fraction * 100}%`, backgroundColor: fills[segment.tone] }]} />
        </View>
      ))}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  row: { flexDirection: "row", gap: t.space[1] },
  track: { flexBasis: 0, height: 6, borderRadius: t.radius.pill, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  fill: { height: 6, borderRadius: t.radius.pill },
}));
