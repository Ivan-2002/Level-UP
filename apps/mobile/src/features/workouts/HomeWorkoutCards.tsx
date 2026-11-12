import { useMemo } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { Text } from "@/components/Text";
import { activeWorkoutStore, outboxStore, useActiveWorkout, useOutbox } from "@/stores/device-stores";
import { createStyles, useTheme } from "@/theme/use-theme";
import { setCounts } from "./active-workout";
import { ElapsedTimer } from "./ElapsedTimer";
import { plural } from "./format";
import { syncOutboxNow } from "./outbox-sync";

/** "Start workout", or "Resume workout" when this user has one in progress. */
export function StartOrResumeWorkout({ userId }: { userId: string }) {
  const workout = useActiveWorkout((s) => s.workout);
  const styles = useStyles();
  const t = useTheme();

  if (!workout || workout.userId !== userId) {
    return (
      <Button
        label="Start workout"
        onPress={() => {
          activeWorkoutStore.getState().start(userId);
          router.push("/workout");
        }}
      />
    );
  }

  const { done } = setCounts(workout);
  return (
    <Card onPress={() => router.push("/workout")} accessibilityLabel="Resume workout" style={styles.resumeCard}>
      <View style={styles.iconTile}>
        <Icon name="dumbbell" />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong">Resume workout</Text>
        <Text variant="caption" tone="inkMuted">
          {workout.name.trim() || "Workout"} · <ElapsedTimer startedAt={workout.startedAt} /> · {plural(done, "set")} done
        </Text>
      </View>
      <Icon name="forward" color={t.colors.inkMuted} size={18} />
    </Card>
  );
}

/** How many workouts are waiting to reach the server, and any that need attention. */
export function SyncStatus({ userId }: { userId: string }) {
  const items = useOutbox((s) => s.items);
  const styles = useStyles();
  const t = useTheme();
  const mine = useMemo(() => items.filter((i) => i.userId === userId), [items, userId]);
  const waiting = mine.filter((i) => i.status === "pending");
  const failed = mine.filter((i) => i.status === "needs_attention");

  if (mine.length === 0) return null;

  return (
    <View style={styles.syncBlock}>
      {waiting.length > 0 ? (
        <Card style={styles.row}>
          <Icon name="sync" color={t.colors.ice} size={18} />
          <View style={styles.flex} accessibilityLiveRegion="polite">
            <Text variant="bodyStrong">{plural(waiting.length, "workout")} waiting to sync</Text>
            <Text variant="caption" tone="inkMuted">
              {waiting.some((i) => i.attempts > 0)
                ? "No connection to the server yet. Retrying automatically."
                : "Sending now…"}
            </Text>
          </View>
        </Card>
      ) : null}

      {failed.map((item) => (
        <Card key={item.clientId} style={styles.failedCard}>
          <View style={styles.row}>
            <Icon name="alert" color={t.colors.danger} size={18} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">
                {item.payload.name ?? "Workout"} needs attention
              </Text>
              <Text variant="caption" tone="inkMuted">
                {new Date(item.payload.startedAt).toLocaleString()} · {item.lastError ?? "The server rejected it."}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button
                label="Retry"
                variant="secondary"
                size="md"
                onPress={() => {
                  outboxStore.getState().retry(item.clientId);
                  syncOutboxNow();
                }}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label="Delete"
                variant="outline"
                size="md"
                tone="danger"
                onPress={() =>
                  Alert.alert("Delete this workout?", "It hasn't reached the server and will be lost for good.", [
                    { text: "Keep", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => outboxStore.getState().remove(item.clientId) },
                  ])
                }
              />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  flex: { flex: 1 },
  resumeCard: { flexDirection: "row", alignItems: "center", borderColor: t.colors.primary },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: t.colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  syncBlock: { gap: t.space[2] },
  row: { flexDirection: "row", alignItems: "center" },
  failedCard: { borderColor: t.colors.danger },
  actions: { flexDirection: "row", gap: t.space[2] },
}));
