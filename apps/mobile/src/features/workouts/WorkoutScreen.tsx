import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { activeWorkoutStore, outboxStore, useActiveWorkout } from "@/stores/device-stores";
import { createStyles, useTheme } from "@/theme/use-theme";
import { setCounts } from "./active-workout";
import { ElapsedTimer } from "./ElapsedTimer";
import { ExerciseCard } from "./ExerciseCard";
import { finishActiveWorkout } from "./finish-workout";
import { plural } from "./format";
import { syncOutboxNow } from "./outbox-sync";

function goHome() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

// "Log workout": the workout in progress. Everything here is saved on the phone as you
// type, so leaving the screen, losing signal or killing the app loses nothing.
export function WorkoutScreen() {
  const { data: session } = authClient.useSession();
  const workout = useActiveWorkout((s) => s.workout);
  const [finishError, setFinishError] = useState<string | null>(null);
  const styles = useStyles();
  const t = useTheme();

  // Opened with no workout (e.g. it was just finished): show a way out rather than
  // redirecting, which would race with the navigation that's already happening.
  if (!workout || workout.userId !== session?.user.id) {
    return (
      <SafeAreaView style={[styles.screen, styles.empty]}>
        <Text tone="inkMuted" style={styles.centeredText}>
          No workout in progress.
        </Text>
        <Button label="Back to home" variant="outline" onPress={goHome} />
      </SafeAreaView>
    );
  }

  const { done } = setCounts(workout);

  function finish() {
    const result = finishActiveWorkout({ activeWorkout: activeWorkoutStore, outbox: outboxStore, now: new Date() });
    if (!result.ok) return setFinishError(result.message);
    syncOutboxNow(); // try right away; the outbox keeps retrying if we're offline
    goHome();
  }

  function discard() {
    Alert.alert("Discard workout?", "Your sets will be deleted from this phone. This can't be undone.", [
      { text: "Keep logging", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          goHome();
          activeWorkoutStore.getState().clear();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <IconButton icon="back" onPress={goHome} accessibilityLabel="Back to home" />
            <View style={styles.savedPill}>
              <Icon name="check" size={14} color={t.colors.ice} />
              <Text variant="caption" tone="ice">
                Saved on this phone
              </Text>
            </View>
          </View>
          <View>
            <Text variant="title" accessibilityRole="header" numberOfLines={1}>
              {workout.name.trim() || "Workout"}
            </Text>
            <Text variant="label" tone="inkMuted">
              <ElapsedTimer startedAt={workout.startedAt} /> elapsed · {plural(done, "set")} done
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField
            label="Name (optional)"
            value={workout.name}
            onChangeText={(name) => activeWorkoutStore.getState().rename(name)}
            placeholder="e.g. Push day"
            maxLength={60}
            returnKeyType="done"
          />

          {workout.exercises.map((draft) => (
            <ExerciseCard key={draft.id} draft={draft} />
          ))}

          <Button label="Add exercise" icon="plus" variant="outline" tone="link" size="md" onPress={() => router.push("/exercise-picker")} />

          <Button label="Discard workout" variant="plain" tone="danger" size="md" onPress={discard} />
        </ScrollView>

        <SafeAreaView edges={["bottom"]} style={styles.footer}>
          {finishError ? (
            <Text variant="label" tone="danger" style={styles.centeredText} accessibilityRole="alert">
              {finishError}
            </Text>
          ) : null}
          <Button label="Finish workout" onPress={finish} disabled={done === 0} />
          <Text variant="caption" tone="inkMuted" style={styles.centeredText}>
            {done === 0
              ? "Tick at least one set to finish."
              : "Saved on this phone until it reaches the server, even offline."}
          </Text>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((t) => ({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: t.colors.bg },
  empty: { alignItems: "stretch", justifyContent: "center", padding: t.space[4], gap: t.space[4] },
  centeredText: { textAlign: "center" },
  header: {
    paddingTop: 20,
    paddingHorizontal: t.space[4],
    paddingBottom: t.space[3],
    gap: t.space[3],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  savedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
    borderWidth: 1,
    borderRadius: t.radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  content: { padding: t.space[4], gap: t.space[3] },
  footer: {
    paddingTop: t.space[3],
    paddingHorizontal: t.space[4],
    paddingBottom: t.space[3],
    backgroundColor: t.colors.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    gap: t.space[2],
  },
}));
