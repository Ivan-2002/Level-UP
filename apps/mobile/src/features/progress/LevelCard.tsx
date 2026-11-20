import { View } from "react-native";
import type { Profile } from "@levelup/shared";
import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { createStyles } from "@/theme/use-theme";
import { homeLevel } from "./level-card";

/**
 * Home: a compact level bar, "Level 6 · Regular" and "2,140 / 6,109 XP". The server's
 * confirmed numbers only: workouts still waiting to sync don't move it (the sync status
 * says they're waiting). Read as one element by screen readers.
 */
export function LevelCard({ profile }: { profile: Pick<Profile, "level" | "stage"> }) {
  const styles = useStyles();
  const level = homeLevel(profile);

  return (
    <Card>
      <View accessible accessibilityLabel={level.accessibilityLabel} style={styles.body}>
        <View style={styles.header}>
          <Text variant="label">{level.title}</Text>
          <Text variant="caption" tone="inkMuted" tabular>
            {level.progressText}
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${level.fraction * 100}%` }]} />
        </View>
      </View>
    </Card>
  );
}

const useStyles = createStyles((t) => ({
  body: { gap: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: t.space[2] },
  track: { height: 8, borderRadius: t.radius.pill, backgroundColor: t.colors.purpleSoft, overflow: "hidden" },
  fill: { height: 8, backgroundColor: t.colors.purple },
}));
