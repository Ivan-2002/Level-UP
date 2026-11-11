import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { TextField } from "@/components/TextField";
import { activeWorkoutStore, outboxStore, useActiveWorkout } from "@/stores/device-stores";
import { colors } from "@/theme/colors";
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

  // Opened with no workout (e.g. it was just finished): show a way out rather than
  // redirecting, which would race with the navigation that's already happening.
  if (!workout || workout.userId !== session?.user.id) {
    return (
      <SafeAreaView style={[styles.screen, styles.empty]}>
        <Text style={styles.emptyText}>No workout in progress.</Text>
        <Button label="Back to home" variant="secondary" onPress={goHome} />
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
            <Pressable onPress={goHome} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to home">
              <Icon name="back" color={colors.ink} strokeWidth={1.75} />
            </Pressable>
            <View style={styles.savedPill}>
              <Icon name="check" size={14} color={colors.ice} />
              <Text style={styles.savedText}>Saved on this phone</Text>
            </View>
          </View>
          <View>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
              {workout.name.trim() || "Workout"}
            </Text>
            <Text style={styles.subtitle}>
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

          <Pressable
            onPress={() => router.push("/exercise-picker")}
            style={styles.addExercise}
            accessibilityRole="button"
          >
            <Icon name="plus" size={18} color={colors.ink} strokeWidth={1.75} />
            <Text style={styles.addExerciseText}>Add exercise</Text>
          </Pressable>

          <Pressable onPress={discard} style={styles.discard} accessibilityRole="button">
            <Text style={styles.discardText}>Discard workout</Text>
          </Pressable>
        </ScrollView>

        <SafeAreaView edges={["bottom"]} style={styles.footer}>
          {finishError ? (
            <Text style={styles.finishError} accessibilityRole="alert">
              {finishError}
            </Text>
          ) : null}
          <Button label="Finish workout" onPress={finish} disabled={done === 0} />
          <Text style={styles.footerHint}>
            {done === 0
              ? "Tick at least one set to finish."
              : "Saved on this phone until it reaches the server, even offline."}
          </Text>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  empty: { alignItems: "stretch", justifyContent: "center", padding: 16, gap: 16 },
  emptyText: { color: colors.inkMuted, fontSize: 15, textAlign: "center" },
  header: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  savedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  savedText: { color: colors.ice, fontSize: 12, fontWeight: "500" },
  title: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: "700" },
  subtitle: { color: colors.inkMuted, fontSize: 13 },
  content: { padding: 16, gap: 12 },
  addExercise: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addExerciseText: { color: colors.ink, fontSize: 14, fontWeight: "500" },
  discard: { height: 44, alignItems: "center", justifyContent: "center" },
  discardText: { color: colors.danger, fontSize: 14, fontWeight: "500" },
  footer: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  finishError: { color: colors.danger, fontSize: 13, textAlign: "center" },
  footerHint: { color: colors.inkMuted, fontSize: 12, textAlign: "center" },
});
