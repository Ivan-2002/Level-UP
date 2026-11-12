import { useState } from "react";
import { Alert, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { IconButton } from "@/components/IconButton";
import { SetRow, SetTableHeader } from "@/components/SetRow";
import { Text } from "@/components/Text";
import { activeWorkoutStore } from "@/stores/device-stores";
import { createStyles } from "@/theme/use-theme";
import type { DraftExercise, DraftSet } from "./active-workout";
import { capitalise } from "./format";
import { loggingConvention } from "./logging-conventions";

// One exercise in the workout: its sets, with weight / reps inputs and a done tick each.
// Actions go straight to the store (activeWorkoutStore.getState() gives stable functions),
// and every change is saved to the phone immediately.
//
// Weights are still typed in kg here: the 4b workout store keeps kg text. Phase 5 replaces
// this screen with the active workout screen, which types in the player's unit.
const WEIGHT_UNIT = "kg";

export function ExerciseCard({ draft }: { draft: DraftExercise }) {
  const { exercise } = draft;
  const convention = loggingConvention(exercise);
  const repsUnit = convention.repsLabel === "SEC" ? "seconds" : "reps";
  const [errors, setErrors] = useState<Record<string, string>>({});
  const styles = useStyles();
  const actions = activeWorkoutStore.getState();

  function showOptions() {
    Alert.alert(exercise.name, undefined, [
      { text: "Remove exercise", style: "destructive", onPress: () => actions.removeExercise(draft.id) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function toggleDone(set: DraftSet) {
    const error = actions.toggleSetDone(draft.id, set.id);
    setErrors(({ [set.id]: _old, ...rest }) => (error ? { ...rest, [set.id]: error } : rest));
  }

  return (
    <Card accessibilityLabel={exercise.name}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text variant="heading">{exercise.name}</Text>
          <Text variant="label" tone="inkMuted">
            {capitalise(exercise.bodyPart)} · {exercise.equipment}
          </Text>
          {convention.hint ? (
            <Text variant="caption" tone="ice">
              {convention.hint}
            </Text>
          ) : null}
        </View>
        <IconButton icon="more" variant="plain" onPress={showOptions} accessibilityLabel={`${exercise.name} options`} />
      </View>

      <View style={styles.table}>
        <SetTableHeader weightUnit={WEIGHT_UNIT} repsUnit={repsUnit} />
        {draft.sets.map((set, index) => (
          <SetRow
            key={set.id}
            number={index + 1}
            weight={set.weightKg}
            reps={set.reps}
            onChangeWeight={(weightKg) => actions.updateSet(draft.id, set.id, { weightKg })}
            onChangeReps={(reps) => actions.updateSet(draft.id, set.id, { reps })}
            weightUnit={WEIGHT_UNIT}
            repsUnit={repsUnit}
            bodyweight={exercise.equipment === "bodyweight"}
            done={set.doneAt !== null}
            onToggleDone={() => toggleDone(set)}
            error={errors[set.id]}
            numberHint="Removes this set"
            onPressNumber={() =>
              Alert.alert(`Remove set ${index + 1}?`, undefined, [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive", onPress: () => actions.removeSet(draft.id, set.id) },
              ])
            }
          />
        ))}
      </View>

      <Button label="Add set" icon="plus" variant="dashed" size="md" onPress={() => actions.addSet(draft.id)} />
    </Card>
  );
}

const useStyles = createStyles((t) => ({
  header: { flexDirection: "row", alignItems: "flex-start", gap: t.space[3] },
  titleBlock: { flex: 1, gap: 2 },
  table: { gap: t.space[1] },
}));
