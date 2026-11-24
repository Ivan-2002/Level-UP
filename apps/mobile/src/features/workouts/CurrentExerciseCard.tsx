import { useState } from "react";
import { AccessibilityInfo, Alert, View } from "react-native";
import { router } from "expo-router";
import {
  coachAdvice,
  coachHintText,
  formatWeight,
  REST_MAX_SEC,
  REST_MIN_SEC,
  type ExerciseSummary,
} from "@levelup/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { InfoChip } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { SetRow, SetTableHeader } from "@/components/SetRow";
import { Stepper } from "@/components/Stepper";
import { Text } from "@/components/Text";
import { activeWorkoutStore, restTimerStore } from "@/stores/device-stores";
import { createStyles, useTheme } from "@/theme/use-theme";
import { doneSetError, type ActiveWorkout, type DraftExercise } from "./active-workout";
import { E1rmChart } from "./E1rmChart";
import { capitalise, formatRest } from "./format";
import {
  BASELINE_CAPTION,
  e1rmBars,
  lastSessionText,
  livePrs,
  nextUp,
  previousSetText,
  scoreLiveWorkout,
  setXpNote,
  showsBaselineCaption,
  suggestedRestText,
  tickFeedback,
  tickLine,
  todayBestE1rm,
  type LiveScore,
  type LiveScoringContext,
} from "./live-workout";
import { loggingConvention } from "./logging-conventions";

type Props = {
  workout: ActiveWorkout;
  draft: DraftExercise;
  /** This exercise's history; undefined while loading or never fetched (offline). */
  summary: ExerciseSummary | undefined;
  bodyweightKg: number;
  /** The live score (scoreLiveWorkout) and the pinned context it uses; null until pinned. */
  live: LiveScore | null;
  context: LiveScoringContext | null;
};

/** The exercise on screen: last time, the coach's target, rest, the sets, the trend. */
export function CurrentExerciseCard({ workout, draft, summary, bodyweightKg, live, context }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The latest tick, while it re-scored earlier sets: its row says so ("· 3 earlier sets now warm-ups").
  const [lastTick, setLastTick] = useState<{ setId: string; rescored: number } | null>(null);
  // The set being typed in: its done-set error waits until editing ends.
  const [editing, setEditing] = useState<string | null>(null);
  const styles = useStyles();
  const t = useTheme();
  const unit = workout.weightUnit;
  const { exercise } = draft;
  const actions = activeWorkoutStore.getState();
  const convention = loggingConvention(exercise, unit);
  const repsUnit = exercise.repsUnit === "seconds" ? "seconds" : "reps";

  const previous = summary?.previousSession?.sets;
  const bestBefore = summary?.records.bestE1rm?.value ?? null;
  const prs = livePrs(draft, unit, bodyweightKg, summary ? bestBefore : null);
  const today = todayBestE1rm(draft, unit, bodyweightKg);
  const bestShown = Math.max(bestBefore ?? 0, today ?? 0);
  const hint = coachHintText(
    coachAdvice({
      lastSets: previous ?? [],
      targetReps: draft.targetReps,
      equipment: exercise.equipment,
      repsUnit: exercise.repsUnit,
      weightUnit: unit,
    }),
    exercise.repsUnit,
    unit,
  );

  function toggle(setKey: string, setNumber: number) {
    const wasDone = draft.sets.find((s) => s.id === setKey)?.doneAt !== null;
    const error = actions.toggleSetDone(draft.id, setKey);
    setErrors(({ [setKey]: _old, ...rest }) => (error ? { ...rest, [setKey]: error } : rest));
    if (error) return;

    // Earlier rows update quietly; the tick itself is announced with the new total, so a
    // screen-reader user hears a drop too.
    const updated = activeWorkoutStore.getState().workout;
    const after = updated && context ? scoreLiveWorkout(updated, context) : null;
    const feedback = tickFeedback({ setId: setKey, setNumber, done: !wasDone, before: live, after });
    AccessibilityInfo.announceForAccessibility(feedback.announcement);
    setLastTick(
      !wasDone && feedback.rescoredAsWarmUps > 0 ? { setId: setKey, rescored: feedback.rescoredAsWarmUps } : null,
    );
    if (wasDone) return;
    // Ticked done: rest starts now, unless that was the last set of the workout.
    const next = updated ? nextUp(updated) : null;
    if (next) restTimerStore.getState().start(draft.restSec, next);
    else restTimerStore.getState().skip();
  }

  const openHistory = () => router.push({ pathname: "/exercises/[id]/history", params: { id: exercise.id } });

  function showOptions() {
    Alert.alert(exercise.name, undefined, [
      { text: "Remove exercise", style: "destructive", onPress: () => actions.removeExercise(draft.id) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="title">{exercise.name}</Text>
          <Text variant="label" tone="inkMuted">
            {capitalise(exercise.bodyPart)} · {exercise.equipment}
          </Text>
        </View>
        <IconButton icon="history" onPress={openHistory} accessibilityLabel={`${exercise.name} history`} />
        <IconButton icon="more" variant="plain" onPress={showOptions} accessibilityLabel={`${exercise.name} options`} />
      </View>

      {previous?.length || bestShown > 0 ? (
        <View style={styles.chips}>
          {previous?.length ? <InfoChip label="Last time" value={lastSessionText(previous, exercise, unit)} /> : null}
          {bestShown > 0 ? (
            <InfoChip
              icon="pr"
              tone="progress"
              value={`PR est. 1RM ${formatWeight(bestShown, unit, { decimals: 0 })}`}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.hint}>
        <Icon name="coach" size={16} color={t.colors.ice} />
        <View style={styles.flex}>
          <Text variant="label">{hint}</Text>
          {convention.hint ? (
            <Text variant="caption" tone="inkMuted">
              {convention.hint}
            </Text>
          ) : null}
        </View>
      </View>

      <Stepper
        label="Rest between sets"
        hint={suggestedRestText(exercise.mechanic)}
        value={formatRest(draft.restSec)}
        onDecrease={() => actions.stepRest(draft.id, -1)}
        onIncrease={() => actions.stepRest(draft.id, 1)}
        canDecrease={draft.restSec > REST_MIN_SEC}
        canIncrease={draft.restSec < REST_MAX_SEC}
      />

      <View style={styles.table}>
        {showsBaselineCaption(exercise, context) ? (
          <Text variant="caption" tone="inkMuted">
            {BASELINE_CAPTION}
          </Text>
        ) : null}
        <SetTableHeader weightUnit={unit} repsUnit={repsUnit} previousLabel="Last time" />
        {draft.sets.map((set, index) => {
          const pr = prs.get(set.id);
          const score = set.doneAt !== null ? live?.bySet.get(set.id) : undefined;
          const note = score ? setXpNote(score) : undefined;
          return (
            <SetRow
              key={set.id}
              number={index + 1}
              previous={previousSetText(previous, index, exercise, unit)}
              weight={set.weight}
              reps={set.reps}
              onChangeWeight={(weight) => actions.updateSet(draft.id, set.id, { weight })}
              onChangeReps={(reps) => actions.updateSet(draft.id, set.id, { reps })}
              onFocusInput={() => {
                // Focusing another set ends editing the previous one (its blur does too).
                actions.endEditing();
                setEditing(set.id);
              }}
              onBlurInput={() => {
                actions.endEditing();
                setEditing((current) => (current === set.id ? null : current));
              }}
              weightUnit={unit}
              repsUnit={repsUnit}
              bodyweight={exercise.equipment === "bodyweight"}
              done={set.doneAt !== null}
              onToggleDone={() => toggle(set.id, index + 1)}
              xpNote={note && lastTick?.setId === set.id ? tickLine(note, lastTick.rescored) : note}
              prText={pr ? `New PR · est. 1RM ${formatWeight(pr, unit, { decimals: 0 })}` : undefined}
              error={
                errors[set.id] ?? (editing === set.id ? undefined : (doneSetError(set, exercise, unit) ?? undefined))
              }
              numberHint="Removes this set"
              onPressNumber={() =>
                Alert.alert(`Remove set ${index + 1}?`, undefined, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => actions.removeSet(draft.id, set.id) },
                ])
              }
            />
          );
        })}
      </View>

      <Button label="Add set" icon="plus" variant="dashed" size="md" onPress={() => actions.addSet(draft.id)} />

      {exercise.repsUnit === "reps" && summary ? (
        <E1rmChart
          bars={e1rmBars(summary.sessions, today)}
          unit={unit}
          action={<Button label="See history" variant="plain" tone="link" size="md" onPress={openHistory} />}
        />
      ) : null}
    </Card>
  );
}

const useStyles = createStyles((t) => ({
  header: { flexDirection: "row", alignItems: "flex-start", gap: t.space[3] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space[2] },
  hint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: t.space[2],
    paddingVertical: 10,
    paddingHorizontal: t.space[3],
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  table: { gap: t.space[1] },
}));
