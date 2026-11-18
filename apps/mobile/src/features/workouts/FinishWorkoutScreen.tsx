import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { authClient } from "@/lib/auth-client";
import { activeWorkoutStore, finishedWorkoutStore, outboxStore, restTimerStore, useActiveWorkout } from "@/stores/device-stores";
import { createStyles, useTheme } from "@/theme/use-theme";
import { useExercises } from "@/features/exercises/use-exercises";
import { useRoutine, useSaveRoutine } from "@/features/routines/use-routines";
import { buildFinishPayload, setCounts } from "./active-workout";
import { finishActiveWorkout } from "./finish-workout";
import { formatElapsed, plural } from "./format";
import { syncOutboxNow } from "./outbox-sync";
import { routineChanges, routineFromWorkout } from "./routine-sync";

// "Finish workout?": one step between the Finish button and the summary, so a stray tap
// doesn't end the workout, and the place to answer the routine question:
// - an empty workout: "Save as a routine?" (with a name);
// - a routine workout that changed: "Update {routine} with these changes?".
// The routine is saved BEFORE the workout is queued, so a new routine is linked to the
// workout that created it. Saving a routine needs a connection; the workout never does.
export function FinishWorkoutScreen() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const workout = useActiveWorkout((s) => s.workout);
  const library = useExercises(userId);
  const routine = useRoutine(userId, workout?.routineId ?? null);
  const save = useSaveRoutine(userId);
  const [saveAs, setSaveAs] = useState(false);
  const [update, setUpdate] = useState(false);
  const [name, setName] = useState(workout?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [routineFailed, setRoutineFailed] = useState(false);
  const styles = useStyles();
  const t = useTheme();

  if (!workout || workout.userId !== userId) {
    return (
      <SafeAreaView style={styles.sheet}>
        <Text tone="inkMuted" style={styles.centered}>
          No workout in progress.
        </Text>
        <Button label="Close" variant="outline" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const now = new Date();
  const { done, total } = setCounts(workout);
  const ready = buildFinishPayload(workout, now);
  const names = new Map((library.data ?? []).map((e) => [e.id, e.name]));
  const changes = routineChanges(workout, names);
  const routineName = routine.data?.name ?? workout.name;
  const askSave = workout.routineId === null;
  const askUpdate = !askSave && changes.length > 0;

  /** Queue the workout, remember it for the summary, and show the summary. */
  function complete() {
    const snapshot = activeWorkoutStore.getState().workout;
    const result = finishActiveWorkout({ activeWorkout: activeWorkoutStore, outbox: outboxStore, now: new Date() });
    if (!result.ok || !snapshot) return setError(result.ok ? "No workout in progress." : result.message);
    finishedWorkoutStore.getState().record(snapshot, new Date());
    restTimerStore.getState().skip(); // no rest alert after the workout is over
    syncOutboxNow(); // try right away; the outbox keeps retrying if offline
    router.dismissAll();
    router.push("/workout-summary");
  }

  function finish() {
    setError(null);
    const wantsRoutine = (askSave && saveAs) || (askUpdate && update);
    if (!wantsRoutine) return complete();

    const current = activeWorkoutStore.getState().workout!;
    const input = routineFromWorkout(current, askSave ? name.trim() : routineName);
    if (!input.ok) return setError(input.message);
    save.mutate(
      { id: askSave ? null : current.routineId, input: input.value },
      {
        onSuccess: (saved) => {
          if (askSave) activeWorkoutStore.getState().linkRoutine(saved.id);
          complete();
        },
        onError: (e) => {
          setRoutineFailed(true);
          setError(`Couldn't save the routine: ${e.message}`);
        },
      },
    );
  }

  return (
    <SafeAreaView style={styles.sheet} edges={["left", "right", "bottom"]}>
      <View style={styles.titleRow}>
        <Text variant="title" accessibilityRole="header">
          Finish workout?
        </Text>
        <Button label="Keep going" variant="plain" tone="link" size="md" onPress={() => router.back()} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text tone="inkMuted" tabular>
            {plural(done, "set")} done · {formatElapsed(now.getTime() - Date.parse(workout.startedAt))}
            {total > done ? ` · ${plural(total - done, "set")} not ticked won't be saved` : ""}
          </Text>

          {askSave ? (
            <Card>
              <Text variant="heading">Save as a routine?</Text>
              <Text variant="label" tone="inkMuted">
                Start it again with one tap, with today&apos;s numbers to beat.
              </Text>
              <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="Save as a routine">
                <Chip label="Not now" role="radio" selected={!saveAs} onPress={() => setSaveAs(false)} />
                <Chip label="Save routine" role="radio" selected={saveAs} onPress={() => setSaveAs(true)} />
              </View>
              {saveAs ? <TextField label="Routine name" value={name} onChangeText={setName} placeholder="e.g. Push day" maxLength={60} /> : null}
            </Card>
          ) : null}

          {askUpdate ? (
            <Card>
              <Text variant="heading">Update {routineName} with these changes?</Text>
              <View style={styles.changes}>
                {changes.map((change) => (
                  <View key={change} style={styles.change}>
                    <Icon name="edit" size={14} color={t.colors.inkMuted} />
                    <Text variant="label">{change}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={`Update ${routineName}`}>
                <Chip label="Keep it as it was" role="radio" selected={!update} onPress={() => setUpdate(false)} />
                <Chip label="Update routine" role="radio" selected={update} onPress={() => setUpdate(true)} />
              </View>
            </Card>
          ) : null}

          {!ready.ok ? (
            <Text tone="danger" accessibilityRole="alert">
              {ready.message}
            </Text>
          ) : null}
          {error ? (
            <Text tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </ScrollView>
        <View style={styles.footer}>
          <Button label="Finish workout" onPress={finish} disabled={!ready.ok} loading={save.isPending} />
          {routineFailed ? <Button label="Finish without saving the routine" variant="plain" tone="link" size="md" onPress={complete} /> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((t) => ({
  sheet: { flex: 1, backgroundColor: t.colors.surface },
  flex: { flex: 1 },
  centered: { textAlign: "center", padding: t.space[4] },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: t.space[4], paddingTop: t.space[4] },
  content: { padding: t.space[4], gap: t.space[4] },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: t.space[2] },
  changes: { gap: t.space[1] },
  change: { flexDirection: "row", alignItems: "center", gap: t.space[2] },
  footer: { padding: t.space[4], gap: t.space[2], borderTopWidth: 1, borderTopColor: t.colors.border },
}));
