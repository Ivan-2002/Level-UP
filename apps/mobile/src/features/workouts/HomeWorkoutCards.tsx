import { useMemo } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { activeWorkoutStore, outboxStore, useActiveWorkout, useOutbox } from "@/stores/device-stores";
import { colors } from "@/theme/colors";
import { setCounts } from "./active-workout";
import { ElapsedTimer } from "./ElapsedTimer";
import { plural } from "./format";
import { syncOutboxNow } from "./outbox-sync";

/** "Start workout", or "Resume workout" when this user has one in progress. */
export function StartOrResumeWorkout({ userId }: { userId: string }) {
  const workout = useActiveWorkout((s) => s.workout);

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
    <Pressable
      onPress={() => router.push("/workout")}
      accessibilityRole="button"
      accessibilityLabel="Resume workout"
      style={({ pressed }) => [styles.card, styles.resumeCard, pressed && styles.pressed]}
    >
      <View style={styles.iconTile}>
        <Icon name="dumbbell" color={colors.ink} strokeWidth={1.75} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>Resume workout</Text>
        <Text style={styles.cardText}>
          {workout.name.trim() || "Workout"} · <ElapsedTimer startedAt={workout.startedAt} /> · {plural(done, "set")} done
        </Text>
      </View>
      <Icon name="forward" color={colors.inkMuted} size={18} />
    </Pressable>
  );
}

/** How many workouts are waiting to reach the server, and any that need attention. */
export function SyncStatus({ userId }: { userId: string }) {
  const items = useOutbox((s) => s.items);
  const mine = useMemo(() => items.filter((i) => i.userId === userId), [items, userId]);
  const waiting = mine.filter((i) => i.status === "pending");
  const failed = mine.filter((i) => i.status === "needs_attention");

  if (mine.length === 0) return null;

  return (
    <View style={styles.syncBlock}>
      {waiting.length > 0 ? (
        <View style={[styles.card, styles.row]} accessibilityLiveRegion="polite">
          <Icon name="sync" color={colors.ice} size={18} />
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{plural(waiting.length, "workout")} waiting to sync</Text>
            <Text style={styles.cardText}>
              {waiting.some((i) => i.attempts > 0)
                ? "No connection to the server yet. Retrying automatically."
                : "Sending now…"}
            </Text>
          </View>
        </View>
      ) : null}

      {failed.map((item) => (
        <View key={item.clientId} style={[styles.card, styles.failedCard]}>
          <View style={styles.row}>
            <Icon name="alert" color={colors.danger} size={18} />
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>
                {item.payload.name ?? "Workout"} needs attention
              </Text>
              <Text style={styles.cardText}>
                {new Date(item.payload.startedAt).toLocaleString()} · {item.lastError ?? "The server rejected it."}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button
                label="Retry"
                variant="secondary"
                onPress={() => {
                  outboxStore.getState().retry(item.clientId);
                  syncOutboxNow();
                }}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label="Delete"
                variant="secondary"
                onPress={() =>
                  Alert.alert("Delete this workout?", "It hasn't reached the server and will be lost for good.", [
                    { text: "Keep", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => outboxStore.getState().remove(item.clientId) },
                  ])
                }
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12 },
  resumeCard: { flexDirection: "row", alignItems: "center", gap: 12, borderColor: colors.primary },
  pressed: { opacity: 0.7 },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  cardText: { color: colors.inkMuted, fontSize: 12, lineHeight: 16 },
  syncBlock: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  failedCard: { borderColor: colors.danger, gap: 12 },
  actions: { flexDirection: "row", gap: 8 },
});
