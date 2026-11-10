import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "@/components/Icon";
import { activeWorkoutStore } from "@/stores/device-stores";
import { colors } from "@/theme/colors";
import type { DraftExercise, DraftSet } from "./active-workout";
import { capitalise } from "./format";
import { loggingConvention } from "./logging-conventions";

// One exercise in the workout: its sets, with kg / reps inputs and a done tick each.
// Actions go straight to the store (activeWorkoutStore.getState() gives stable functions),
// and every change is saved to the phone immediately.

export function ExerciseCard({ draft }: { draft: DraftExercise }) {
  const { exercise } = draft;
  const convention = loggingConvention(exercise);
  const [errors, setErrors] = useState<Record<string, string>>({});
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
    <View style={styles.card} accessibilityLabel={exercise.name}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{exercise.name}</Text>
          <Text style={styles.subtitle}>
            {capitalise(exercise.bodyPart)} · {exercise.equipment}
          </Text>
          {convention.hint ? <Text style={styles.hint}>{convention.hint}</Text> : null}
        </View>
        <Pressable onPress={showOptions} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`${exercise.name} options`}>
          <Icon name="more" color={colors.inkMuted} />
        </Pressable>
      </View>

      <View style={styles.row}>
        <Text style={[styles.columnLabel, styles.setColumn]}>SET</Text>
        <Text style={[styles.columnLabel, styles.inputColumn]}>KG</Text>
        <Text style={[styles.columnLabel, styles.inputColumn]}>{convention.repsLabel}</Text>
        <View style={styles.doneColumn} />
      </View>

      {draft.sets.map((set, index) => (
        <View key={set.id}>
          <SetRow
            set={set}
            number={index + 1}
            repsLabel={convention.repsLabel === "SEC" ? "seconds" : "reps"}
            onChange={(changes) => actions.updateSet(draft.id, set.id, changes)}
            onToggleDone={() => toggleDone(set)}
            onRemove={() =>
              Alert.alert(`Remove set ${index + 1}?`, undefined, [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive", onPress: () => actions.removeSet(draft.id, set.id) },
              ])
            }
          />
          {errors[set.id] ? (
            <Text style={styles.error} accessibilityRole="alert">
              {errors[set.id]}
            </Text>
          ) : null}
        </View>
      ))}

      <Pressable onPress={() => actions.addSet(draft.id)} style={styles.addSet} accessibilityRole="button">
        <Icon name="plus" size={16} color={colors.ice} />
        <Text style={styles.addSetText}>Add set</Text>
      </Pressable>
    </View>
  );
}

type SetRowProps = {
  set: DraftSet;
  number: number;
  repsLabel: "reps" | "seconds";
  onChange: (changes: { weightKg?: string; reps?: string }) => void;
  onToggleDone: () => void;
  onRemove: () => void;
};

function SetRow({ set, number, repsLabel, onChange, onToggleDone, onRemove }: SetRowProps) {
  const done = set.doneAt !== null;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onRemove}
        style={styles.setColumn}
        accessibilityRole="button"
        accessibilityLabel={`Set ${number}`}
        accessibilityHint="Removes this set"
      >
        <Text style={styles.setNumber}>{number}</Text>
      </Pressable>
      <TextInput
        value={set.weightKg}
        onChangeText={(weightKg) => onChange({ weightKg })}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.inkMuted}
        maxLength={6}
        accessibilityLabel={`Set ${number} weight in kg`}
        style={[styles.input, styles.inputColumn]}
      />
      <TextInput
        value={set.reps}
        onChangeText={(reps) => onChange({ reps })}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={colors.inkMuted}
        maxLength={3}
        accessibilityLabel={`Set ${number} ${repsLabel}`}
        style={[styles.input, styles.inputColumn]}
      />
      <Pressable
        onPress={onToggleDone}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`Set ${number} done`}
        style={[styles.doneButton, done ? styles.doneOn : styles.doneOff]}
      >
        <Icon name="check" size={18} strokeWidth={2.5} color={done ? colors.bg : colors.inkMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 4,
    gap: 8,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titleBlock: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  subtitle: { color: colors.inkMuted, fontSize: 12 },
  hint: { color: colors.ice, fontSize: 12 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  columnLabel: { color: colors.inkMuted, fontSize: 11, fontWeight: "600", letterSpacing: 0.4, textAlign: "center" },
  setColumn: { width: 36, height: 40, justifyContent: "center" },
  inputColumn: { flex: 1 },
  doneColumn: { width: 44 },
  setNumber: { color: colors.ink, fontSize: 14, fontWeight: "600", textAlign: "center" },
  input: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.ink,
    fontSize: 15,
    textAlign: "center",
  },
  doneButton: { width: 44, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  doneOn: { backgroundColor: colors.success },
  doneOff: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  error: { color: colors.danger, fontSize: 12, marginLeft: 44, marginTop: 4 },
  addSet: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  addSetText: { color: colors.ice, fontSize: 14, fontWeight: "500" },
});
