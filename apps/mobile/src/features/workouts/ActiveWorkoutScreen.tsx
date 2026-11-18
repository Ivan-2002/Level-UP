import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { BODYWEIGHT_FALLBACK_KG } from "@levelup/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { AddChip, Chip } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { ProgressSegments } from "@/components/ProgressSegments";
import { StatTile } from "@/components/StatTile";
import { Text } from "@/components/Text";
import { authClient } from "@/lib/auth-client";
import { activeWorkoutStore, restTimerStore, useActiveWorkout } from "@/stores/device-stores";
import { createStyles, useTheme } from "@/theme/use-theme";
import { useProfile } from "@/features/profile/use-profile";
import { currentExercise, setCounts, type ActiveWorkout } from "./active-workout";
import { CurrentExerciseCard } from "./CurrentExerciseCard";
import { ElapsedTimer } from "./ElapsedTimer";
import { lastSessionText, nextUp, pinContext, scoreLiveWorkout, workoutSegments, type LiveScore, type PinnedContext } from "./live-workout";
import { RestBar } from "./RestBar";
import { exerciseSummaryQuery, useExerciseSummary } from "./use-exercise-summary";
import { useXpHistory } from "./use-xp-history";

const EMPTY_SCORES: LiveScore["bySet"] = new Map();

function goHome() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

const addExercise = () => router.push({ pathname: "/add-exercise", params: { for: "workout" } });

// The active workout: everything you need between sets on one screen. All of it lives in
// the active workout store, saved on the phone after every change; nothing reaches the
// server until Finish (the Finish sheet queues it in the outbox, which retries until it
// arrives), then the summary shows what it earned.
export function ActiveWorkoutScreen() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const workout = useActiveWorkout((s) => s.workout);
  const styles = useStyles();

  if (!workout || workout.userId !== userId) {
    // Opened with no workout (e.g. it was just finished): offer a way out rather than
    // redirecting, which would race with the navigation that's already happening.
    return (
      <SafeAreaView style={[styles.screen, styles.empty]}>
        <Text tone="inkMuted" style={styles.centeredText}>
          No workout in progress.
        </Text>
        <Button label="Back to home" variant="outline" onPress={goHome} />
      </SafeAreaView>
    );
  }
  return <Workout workout={workout} userId={userId} />;
}

function Workout({ workout, userId }: { workout: ActiveWorkout; userId: string }) {
  const { data: profile } = useProfile(userId);
  const queryClient = useQueryClient();
  const draft = currentExercise(workout);
  const summary = useExerciseSummary(userId, draft?.exercise.id);
  const styles = useStyles();
  const t = useTheme();
  const bodyweightKg = profile?.bodyweightKg ?? BODYWEIGHT_FALLBACK_KG;
  const xpHistory = useXpHistory(userId);

  // Live XP with the server's pipeline. The context (history, bodyweights) is pinned for
  // the workout (see pinContext), so the total only moves when a set is ticked or edited.
  // React's pattern for "remember something from earlier renders": state, updated during
  // render only when it actually changes (once per workout).
  const [pinned, setPinned] = useState<PinnedContext | null>(null);
  const nextPinned = pinContext(pinned, workout, {
    history: xpHistory,
    bodyweight: { xp: profile?.xpBodyweightKg ?? bodyweightKg, typed: bodyweightKg },
  });
  if (nextPinned !== pinned) setPinned(nextPinned);
  const context = nextPinned?.context;
  const live = useMemo(() => (context ? scoreLiveWorkout(workout, context) : null), [workout, context]);

  // Load every exercise's history up front (and save it on the phone), so switching
  // exercises at the gym doesn't wait for the network.
  const exerciseIds = workout.exercises.map((e) => e.exercise.id).join(",");
  useEffect(() => {
    for (const id of exerciseIds.split(",").filter(Boolean)) void queryClient.prefetchQuery(exerciseSummaryQuery(userId, id));
  }, [exerciseIds, queryClient, userId]);

  const { done, total } = setCounts(workout);
  const { segments, currentIndex } = workoutSegments(workout);
  const index = Math.max(0, currentIndex);
  const following = workout.exercises[index + 1];
  const followingSummary = queryClient.getQueryData(exerciseSummaryQuery(userId, following?.exercise.id ?? "none").queryKey);
  const started = new Date(workout.startedAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  function discard() {
    Alert.alert("Discard workout?", "Your sets will be deleted from this phone. This can't be undone.", [
      { text: "Keep training", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          goHome();
          restTimerStore.getState().skip();
          activeWorkoutStore.getState().clear();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <IconButton icon="back" onPress={goHome} accessibilityLabel="Back to home" />
          <View style={styles.flex}>
            <Text variant="heading" accessibilityRole="header" numberOfLines={1}>
              {workout.name.trim() || "Workout"}
            </Text>
            <Text variant="caption" tone="inkMuted">
              {workout.exercises.length > 0 ? `Exercise ${index + 1} of ${workout.exercises.length} · ${started}` : started}
            </Text>
          </View>
          <Button label="Finish" variant="secondary" size="md" onPress={() => router.push("/finish-workout")} />
        </View>

        <View style={styles.tiles}>
          <StatTile label="Elapsed" icon="timer" value={<ElapsedTimer startedAt={workout.startedAt} />} accessibilityLabel="Elapsed time" />
          <StatTile label="Sets left" value={String(total - done)} suffix={` / ${total}`} accessibilityLabel={`${total - done} of ${total} sets left`} />
          <StatTile label="XP earned" icon="xp" tone="progress" value={live ? `+${live.total}` : "…"} accessibilityLabel={live ? `XP earned, ${live.total}` : "XP earned, loading"} />
        </View>

        {segments.length > 0 ? <ProgressSegments segments={segments} currentIndex={index} /> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.tabsScroll} accessibilityRole="tablist">
          {workout.exercises.map((e) => {
            const doneHere = e.sets.filter((s) => s.doneAt !== null).length;
            return (
              <Chip
                key={e.id}
                label={e.exercise.name}
                role="tab"
                selected={e.id === draft?.id}
                count={`${doneHere}/${e.sets.length}`}
                done={e.sets.length > 0 && doneHere === e.sets.length}
                onPress={() => activeWorkoutStore.getState().selectExercise(e.id)}
                accessibilityLabel={`${e.exercise.name}, ${doneHere} of ${e.sets.length} sets done`}
              />
            );
          })}
          <AddChip onPress={addExercise} accessibilityLabel="Add exercise to this workout" />
        </ScrollView>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {draft ? (
            <CurrentExerciseCard workout={workout} draft={draft} summary={summary.data} bodyweightKg={bodyweightKg} scores={live?.bySet ?? EMPTY_SCORES} />
          ) : (
            <Card>
              <Text variant="heading">Add your first exercise</Text>
              <Text tone="inkMuted">Pick what you&apos;re training. Last time&apos;s numbers come with it.</Text>
            </Card>
          )}

          {following ? (
            <Card
              onPress={() => activeWorkoutStore.getState().selectExercise(following.id)}
              accessibilityLabel={`Up next: ${following.exercise.name}`}
              style={styles.upNext}
            >
              <View style={styles.flex}>
                <Text variant="caption" tone="inkMuted">
                  Up next
                </Text>
                <Text variant="heading">{following.exercise.name}</Text>
                <Text variant="label" tone="inkMuted" tabular>
                  {following.sets.length} {following.sets.length === 1 ? "set" : "sets"}
                  {followingSummary?.previousSession
                    ? ` · last time ${lastSessionText(followingSummary.previousSession.sets, following.exercise, workout.weightUnit)}`
                    : ""}
                </Text>
              </View>
              <Icon name="forward" size={20} color={t.colors.inkMuted} />
            </Card>
          ) : null}

          <Button label="Add exercise" icon="plus" variant="outline" tone="link" size="md" onPress={addExercise} />
          <Button label="Discard workout" variant="plain" tone="danger" size="md" onPress={discard} />
        </ScrollView>
      </KeyboardAvoidingView>

      <SafeAreaView edges={["bottom"]} style={styles.restBar}>
        <RestBar next={nextUp(workout)} restSec={draft?.restSec ?? null} />
      </SafeAreaView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  flex: { flex: 1, minWidth: 0 },
  empty: { alignItems: "stretch", justifyContent: "center", padding: t.space[4], gap: t.space[4] },
  centeredText: { textAlign: "center" },
  header: { paddingTop: t.space[4], paddingHorizontal: t.space[4], paddingBottom: t.space[3], gap: t.space[3], borderBottomWidth: 1, borderBottomColor: t.colors.border },
  titleRow: { flexDirection: "row", alignItems: "center", gap: t.space[3] },
  tiles: { flexDirection: "row", gap: t.space[2] },
  tabsScroll: { marginHorizontal: -t.space[4] },
  tabs: { paddingHorizontal: t.space[4], gap: t.space[2] },
  content: { padding: t.space[4], gap: t.space[4], paddingBottom: t.space[6] },
  upNext: { flexDirection: "row", alignItems: "center" },
  restBar: { backgroundColor: t.colors.surface },
}));
