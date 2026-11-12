import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Text } from "@/components/Text";
import { useNow } from "@/lib/use-now";
import { restTimerStore, useRestTimer } from "@/stores/device-stores";
import { createStyles, useTheme } from "@/theme/use-theme";
import { formatRest } from "./format";
import { remainingText, viewRest } from "./rest-timer";

const RING = 56;
const STROKE = 4;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Fixed to the bottom of the active workout. While resting: a ring of time left with
 * pause/play in the middle, the countdown, what's next, "+30s" and "Skip". Otherwise:
 * "Ready when you are", or "Rest done. You're up." in green.
 */
export function RestBar({ next, restSec }: { next: string | null; restSec: number | null }) {
  const timer = useRestTimer((s) => s.timer);
  const now = useNow(250); // smooth ring; the text only changes once a second anyway
  const view = viewRest(timer, now);
  const styles = useStyles();
  const t = useTheme();
  const nextLine = next ? `Next: ${next}` : "Next: finish your workout";

  if (view.phase === "resting") {
    const actions = restTimerStore.getState();
    return (
      <View style={styles.bar}>
        <Pressable
          onPress={view.paused ? actions.resume : actions.pause}
          accessibilityRole="button"
          accessibilityLabel={view.paused ? "Resume rest timer" : "Pause rest timer"}
          style={styles.ring}
        >
          <Svg width={RING} height={RING} style={styles.ringSvg} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Circle cx={RING / 2} cy={RING / 2} r={RADIUS} stroke={t.colors.surfaceRaised} strokeWidth={STROKE} fill="none" />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              stroke={t.colors.ice}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - view.fraction)}
              // Start at 12 o'clock and run clockwise.
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
          <Icon name={view.paused ? "play" : "pause"} size={18} fill={t.colors.ink} />
        </Pressable>
        <View style={styles.texts} accessible accessibilityLabel={`${view.paused ? "Rest paused" : "Resting"}, ${remainingText(view.remainingMs)} left. ${nextLine}`}>
          <Text variant="caption" tone="inkMuted">
            {view.paused ? "Rest paused" : "Resting"}
          </Text>
          <Text variant="stat" tabular>
            {remainingText(view.remainingMs)}
          </Text>
          <Text variant="caption" tone="inkMuted" numberOfLines={1} tabular>
            {nextLine}
          </Text>
        </View>
        <Button label="+30s" variant="secondary" size="md" onPress={() => actions.addTime(30)} accessibilityLabel="30 seconds more rest" />
        <Button label="Skip" variant="outline" size="md" onPress={actions.skip} accessibilityLabel="Skip rest" />
      </View>
    );
  }

  const done = view.phase === "done";
  return (
    <View style={styles.bar}>
      <View style={styles.idleIcon}>
        <Icon name="timer" size={22} color={done ? t.colors.success : t.colors.inkMuted} />
      </View>
      <View style={styles.texts} accessibilityLiveRegion="polite">
        <Text variant="bodyStrong" tone={done ? "success" : "ink"}>
          {done ? "Rest done. You're up." : "Ready when you are"}
        </Text>
        <Text variant="caption" tone="inkMuted" numberOfLines={2} tabular>
          {next && restSec !== null ? `${nextLine} · rest ${formatRest(restSec)} starts when you tick it` : nextLine}
        </Text>
      </View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space[3],
    paddingTop: t.space[3],
    paddingHorizontal: t.space[4],
    paddingBottom: t.space[3],
    backgroundColor: t.colors.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  ring: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  ringSvg: { position: "absolute", left: 0, top: 0 },
  texts: { flex: 1, minWidth: 0 },
  idleIcon: { width: RING, height: RING, borderRadius: t.radius.pill, backgroundColor: t.colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
}));
