import { useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { coachAdvice, coachHintText, formatWeight, REST_MAX_SEC, REST_MIN_SEC, type ExerciseSummary } from "@levelup/shared";
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
import type { ActiveWorkout, DraftExercise } from "./active-workout";
import { E1rmChart } from "./E1rmChart";
import { capitalise, formatRest } from "./format";
import { e1rmBars, lastSessionText, livePrs, nextUp, previousSetText, suggestedRestText, todayBestE1rm } from "./live-workout";
import { loggingConvention } from "./logging-conventions";

type Props = {
  workout: ActiveWorkout;
  draft: DraftExercise;
  /** This exercise's history; undefined while loading or never fetched (offline). */
  summary: ExerciseSummary | undefined;
  bodyweightKg: number;
};

/** The exercise on screen: last time, the coach's target, rest, the sets, the trend. */
export function CurrentExerciseCard({ workout, draft, summary, bodyweightKg }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
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
    coachAdvice({ lastSets: previous ?? [], targetReps: draft.targetReps, equipment: exercise.equipment, repsUnit: exercise.repsUnit, weightUnit: unit }),
    exercise.repsUnit,
    unit,
  );

  function toggle(setKey: string) {
    const wasDone = draft.sets.find((s) => s.id === setKey)?.doneAt !== null;
    const error = actions.toggleSetDone(draft.id, setKey);
    setErrors(({ [setKey]: _old, ...rest }) => (error ? { ...rest, [setKey]: error } : rest));
    if (error || wasDone) return;
    // Ticked done: rest starts now, unless that was the last set of the workout.
    const updated = activeWorkoutStore.getState().workout;
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
          {bestShown > 0 ? <InfoChip icon="pr" tone="progress" value={`PR est. 1RM ${formatWeight(bestShown, unit, { decimals: 0 })}`} /> : null}
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
        <SetTableHeader weightUnit={unit} repsUnit={repsUnit} previousLabel="Last time" />
        {draft.sets.map((set, index) => {
          const pr = prs.get(set.id);
          return (
            <SetRow
              key={set.id}
              number={index + 1}
              previous={previousSetText(previous, index, exercise, unit)}
              weight={set.weight}
              reps={set.reps}
              onChangeWeight={(weight) => actions.updateSet(draft.id, set.id, { weight })}
              onChangeReps={(reps) => actions.updateSet(draft.id, set.id, { reps })}
              weightUnit={unit}
              repsUnit={repsUnit}
              bodyweight={exercise.equipment === "bodyweight"}
              done={set.doneAt !== null}
              onToggleDone={() => toggle(set.id)}
              prText={pr ? `New PR · est. 1RM ${formatWeight(pr, unit, { decimals: 0 })}` : undefined}
              error={errors[set.id]}
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
