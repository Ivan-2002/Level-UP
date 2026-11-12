import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePreventRemove } from "expo-router";
import { REPS_MAX, REST_MAX_SEC, REST_MIN_SEC, TARGET_SETS_MAX } from "@levelup/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { IconButton } from "@/components/IconButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Stepper } from "@/components/Stepper";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { authClient } from "@/lib/auth-client";
import { newDraftKey, routineDraftStore, useRoutineDraft } from "@/stores/routine-draft-store";
import { createStyles } from "@/theme/use-theme";
import { capitalise, formatRest } from "@/features/workouts/format";
import * as draftRules from "./routine-draft";
import { useRoutine, useSaveRoutine } from "./use-routines";

// Create or edit a routine: a name, then exercises with target sets, reps and rest.
// No timers here: this is planning, not training. Changes are kept in routineDraftStore
// (the Add exercise sheet adds to it) and only reach the server on Save.
export function RoutineBuilderScreen({ routineId }: { routineId: string | null }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const existing = useRoutine(userId, routineId);
  const save = useSaveRoutine(userId);
  const draft = useRoutineDraft((s) => s.draft);
  const original = useRoutineDraft((s) => s.original);
  const [error, setError] = useState<string | null>(null);
  const styles = useStyles();
  const change = routineDraftStore.getState().change;

  // Load the draft ONCE per visit (later refetches must not wipe edits). Until then the
  // store still holds the previous routine's draft, so nothing is shown.
  const forKey = routineId ?? "new";
  const draftFor = useRoutineDraft((s) => s.draftFor);
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    if (routineId === null) routineDraftStore.getState().begin(draftRules.emptyDraft(), forKey);
    else if (existing.data) routineDraftStore.getState().begin(draftRules.draftFromRoutine(existing.data, newDraftKey), forKey);
    else return;
    opened.current = true;
  }, [forKey, routineId, existing.data]);
  const ready = draftFor === forKey;

  const dirty = ready && draftRules.hasChanges(draft, original);

  // Back button, swipe back and Android's back all come through here.
  usePreventRemove(dirty && !save.isPending, ({ repeat }) => {
    Alert.alert("Discard changes?", "Your changes to this routine haven't been saved.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          routineDraftStore.getState().begin(original); // no longer dirty, so leaving is allowed
          repeat();
        },
      },
    ]);
  });

  function submit() {
    const input = draftRules.toRoutineInput(draft);
    if (!input.ok) return setError(input.message);
    setError(null);
    save.mutate(
      { id: draft.routineId, input: input.value },
      {
        onSuccess: (routine) => {
          routineDraftStore.getState().begin(draft); // saved: nothing left to lose
          if (routineId === null) router.replace({ pathname: "/routines/[id]", params: { id: routine.id } });
          else router.back();
        },
        onError: (e) => setError(e.message),
      },
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScreenHeader title="Edit routine" onBack={() => router.back()} />
        {existing.isError ? (
          <Text tone="inkMuted" style={[styles.centeredText, styles.loading]}>
            {"Couldn't load this routine. Check your connection."}
          </Text>
        ) : (
          <ActivityIndicator style={styles.loading} />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader title={routineId === null ? "New routine" : "Edit routine"} onBack={() => router.back()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField
            label="Name"
            value={draft.name}
            onChangeText={(name) => change((d) => draftRules.rename(d, name))}
            placeholder="e.g. Push day"
            maxLength={60}
            returnKeyType="done"
          />

          {draft.exercises.map((item, index) => (
            <Card key={item.key} accessibilityLabel={`${index + 1}. ${item.exercise.name}`}>
              <View style={styles.exerciseHeader}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">
                    {index + 1}. {item.exercise.name}
                  </Text>
                  <Text variant="caption" tone="inkMuted">
                    {capitalise(item.exercise.bodyPart)} · {item.exercise.equipment}
                  </Text>
                </View>
                <IconButton
                  icon="up"
                  variant="plain"
                  disabled={index === 0}
                  onPress={() => change((d) => draftRules.moveExercise(d, item.key, -1))}
                  accessibilityLabel={`Move ${item.exercise.name} up`}
                />
                <IconButton
                  icon="down"
                  variant="plain"
                  disabled={index === draft.exercises.length - 1}
                  onPress={() => change((d) => draftRules.moveExercise(d, item.key, 1))}
                  accessibilityLabel={`Move ${item.exercise.name} down`}
                />
                <IconButton
                  icon="delete"
                  variant="plain"
                  onPress={() => change((d) => draftRules.removeExercise(d, item.key))}
                  accessibilityLabel={`Remove ${item.exercise.name}`}
                />
              </View>
              <PlanSteppers item={item} />
            </Card>
          ))}

          <Button label="Add exercises" icon="plus" variant="dashed" size="md" onPress={() => router.push({ pathname: "/add-exercise", params: { for: "routine" } })} />
        </ScrollView>

        <SafeAreaView edges={["bottom"]} style={styles.footer}>
          {error ? (
            <Text variant="label" tone="danger" accessibilityRole="alert" style={styles.centeredText}>
              {error}
            </Text>
          ) : null}
          <Button label="Save routine" onPress={submit} loading={save.isPending} />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Target sets, reps (or seconds) and rest for one exercise. */
function PlanSteppers({ item }: { item: draftRules.DraftRoutineExercise }) {
  const styles = useStyles();
  const change = routineDraftStore.getState().change;
  const timed = item.exercise.repsUnit === "seconds";
  const rest = item.restSec ?? draftRules.inheritedRestSec(item.exercise);
  const restHint =
    item.restSec !== null ? "Set for this routine" : item.exercise.restPreferenceSec !== null ? "Your usual for this exercise" : "Suggested";

  return (
    <View style={styles.steppers}>
      <Stepper
        label="Sets"
        value={String(item.targetSets)}
        onDecrease={() => change((d) => draftRules.stepTarget(d, item.key, "targetSets", -1))}
        onIncrease={() => change((d) => draftRules.stepTarget(d, item.key, "targetSets", 1))}
        canDecrease={item.targetSets > 1}
        canIncrease={item.targetSets < TARGET_SETS_MAX}
      />
      <Stepper
        label={timed ? "Seconds" : "Reps"}
        value={String(item.targetReps)}
        onDecrease={() => change((d) => draftRules.stepTarget(d, item.key, "targetReps", -1))}
        onIncrease={() => change((d) => draftRules.stepTarget(d, item.key, "targetReps", 1))}
        canDecrease={item.targetReps > (timed ? 5 : 1)}
        canIncrease={item.targetReps < REPS_MAX}
      />
      <Stepper
        label="Rest"
        hint={restHint}
        value={formatRest(rest)}
        onDecrease={() => change((d) => draftRules.stepRest(d, item.key, -1))}
        onIncrease={() => change((d) => draftRules.stepRest(d, item.key, 1))}
        canDecrease={rest > REST_MIN_SEC}
        canIncrease={rest < REST_MAX_SEC}
      />
      {item.restSec !== null ? (
        <Button
          label="Use the usual rest"
          icon="reset"
          variant="plain"
          tone="link"
          size="md"
          onPress={() => change((d) => draftRules.resetRest(d, item.key))}
          style={styles.reset}
        />
      ) : null}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  flex: { flex: 1 },
  loading: { marginTop: t.space[8] },
  content: { paddingHorizontal: t.space[4], paddingBottom: t.space[6], gap: t.space[3] },
  exerciseHeader: { flexDirection: "row", alignItems: "center" },
  steppers: { gap: t.space[2] },
  reset: { alignSelf: "flex-start" },
  centeredText: { textAlign: "center" },
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
