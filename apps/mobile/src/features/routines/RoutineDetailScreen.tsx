import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { LastSessionList, Routine, WeightUnit } from "@levelup/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { IconButton } from "@/components/IconButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { activeWorkoutStore, useActiveWorkout } from "@/stores/device-stores";
import { createStyles } from "@/theme/use-theme";
import { useProfile } from "@/features/profile/use-profile";
import { formatLastDone, formatRest, formatSet, plural } from "@/features/workouts/format";
import { lastSetsFrom } from "@/features/workouts/active-workout";
import { inheritedRestSec } from "./routine-draft";
import { useDeleteRoutine, useLastSessions, useRoutine } from "./use-routines";

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/workouts");
}

// One routine: its exercises with the plan and last time's top set, then Start / Edit.
export function RoutineDetailScreen({ routineId }: { routineId: string }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { data: profile } = useProfile(userId);
  const routine = useRoutine(userId, routineId);
  const lastSessions = useLastSessions(userId, routine.data?.exercises.map((e) => e.exercise.id) ?? []);
  const deleteRoutine = useDeleteRoutine(userId);
  const hasWorkout = useActiveWorkout((s) => s.workout?.userId === userId);
  const styles = useStyles();

  if (!routine.data) {
    const gone = routine.error instanceof ApiError && routine.error.status === 404;
    return (
      <SafeAreaView style={styles.screen}>
        <ScreenHeader title="Routine" onBack={goBack} />
        <View style={styles.centered}>
          {routine.isError ? (
            <>
              <Text tone="inkMuted" style={styles.centeredText}>
                {gone ? "This routine was deleted." : "Couldn't load this routine. Check your connection."}
              </Text>
              {gone ? null : <Button label="Try again" variant="secondary" size="md" onPress={() => routine.refetch()} />}
            </>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const current = routine.data;

  function start() {
    // Never replace a workout in progress: finishing or discarding it is the player's call.
    if (hasWorkout) {
      Alert.alert("You have a workout in progress", "Finish or discard it before starting another.", [
        { text: "Cancel", style: "cancel" },
        { text: "Resume it", onPress: () => router.push("/workout") },
      ]);
      return;
    }
    activeWorkoutStore.getState().startFromRoutine(userId, profile?.weightUnit ?? "kg", current, lastSetsFrom(lastSessions.data));
    router.push("/workout");
  }

  function showOptions() {
    Alert.alert(current.name, undefined, [
      { text: "Edit routine", onPress: () => router.push({ pathname: "/routines/[id]/edit", params: { id: current.id } }) },
      { text: "Delete routine", style: "destructive", onPress: confirmDelete },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function confirmDelete() {
    Alert.alert(`Delete ${current.name}?`, "Workouts you did from it stay in your history.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteRoutine.mutate(current.id, {
            onSuccess: goBack,
            onError: (error) => Alert.alert("Couldn't delete the routine", error.message),
          }),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title={current.name}
        subtitle={`${plural(current.exercises.length, "exercise")} · ${formatLastDone(current.lastDoneAt, new Date())}`}
        onBack={goBack}
        right={<IconButton icon="more" variant="plain" onPress={showOptions} accessibilityLabel={`${current.name} options`} />}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {current.exercises.map((planned, index) => (
          <PlannedExercise key={planned.id} index={index} planned={planned} lastSessions={lastSessions.data} unit={profile?.weightUnit ?? "kg"} />
        ))}
      </ScrollView>
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <Button label="Edit" icon="edit" variant="secondary" onPress={() => router.push({ pathname: "/routines/[id]/edit", params: { id: current.id } })} style={styles.edit} />
        <Button label={hasWorkout ? "Workout in progress" : "Start"} icon="play" onPress={start} style={styles.start} />
      </SafeAreaView>
    </SafeAreaView>
  );
}

function PlannedExercise(props: { index: number; planned: Routine["exercises"][number]; lastSessions?: LastSessionList; unit: WeightUnit }) {
  const { planned, unit } = props;
  const styles = useStyles();
  const { exercise } = planned;
  const last = props.lastSessions?.items.find((i) => i.exerciseId === exercise.id)?.session.topSet;
  const rest = planned.restSec ?? inheritedRestSec(exercise);
  const target = exercise.repsUnit === "seconds" ? `${planned.targetSets} × ${planned.targetReps} s` : `${planned.targetSets} × ${planned.targetReps}`;

  return (
    <Card style={styles.exercise}>
      <View style={styles.number}>
        <Text variant="labelStrong" tabular>
          {props.index + 1}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{exercise.name}</Text>
        <Text variant="label" tone="inkMuted" tabular>
          {target} · Rest {formatRest(rest)}
        </Text>
        <Text variant="caption" tone={last ? "ink" : "inkMuted"} tabular>
          {last ? `Last: ${formatSet(last, exercise, unit)}` : "Not done yet"}
        </Text>
      </View>
    </Card>
  );
}

const useStyles = createStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { paddingHorizontal: t.space[4], paddingBottom: t.space[6], gap: t.space[2] },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: t.space[4], gap: t.space[4] },
  centeredText: { textAlign: "center" },
  exercise: { flexDirection: "row", alignItems: "flex-start", padding: t.space[3] },
  number: {
    width: 28,
    height: 28,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1, gap: 2 },
  footer: {
    flexDirection: "row",
    gap: t.space[2],
    paddingTop: t.space[3],
    paddingHorizontal: t.space[4],
    paddingBottom: t.space[3],
    backgroundColor: t.colors.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  edit: { flex: 1 },
  start: { flex: 2 },
}));
