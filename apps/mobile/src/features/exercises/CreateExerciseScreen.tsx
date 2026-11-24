import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  BODY_PARTS,
  createExerciseSchema,
  EQUIPMENT,
  MECHANICS,
  REPS_UNITS,
  type BodyPart,
  type Equipment,
  type Mechanic,
  type RepsUnit,
} from "@levelup/shared";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { createStyles } from "@/theme/use-theme";
import { capitalise } from "@/features/workouts/format";
import { sheetSelection } from "./AddExerciseSheet";
import { useCreateExercise } from "./use-exercises";

type Field = "name" | "muscleGroup" | "bodyPart" | "equipment" | "mechanic";

// A custom exercise, opened from the Add exercise sheet. The server picks its XP tuning
// (load factor, bodyweight share) from these answers, so nobody can make one worth more.
// On success it goes back to the sheet with the new exercise already selected.
export function CreateExerciseScreen({ initialName }: { initialName: string }) {
  const { data: session } = authClient.useSession();
  const create = useCreateExercise(session?.user.id ?? "");
  const [name, setName] = useState(initialName);
  const [muscleGroup, setMuscleGroup] = useState("");
  const [bodyPart, setBodyPart] = useState<BodyPart | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [mechanic, setMechanic] = useState<Mechanic>("compound");
  const [repsUnit, setRepsUnit] = useState<RepsUnit>("reps");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const styles = useStyles();

  function submit() {
    const parsed = createExerciseSchema.safeParse({ name, muscleGroup, bodyPart, equipment, mechanic, repsUnit });
    if (!parsed.success) {
      const found: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues)
        found[issue.path[0] as Field] ??=
          issue.path[0] === "bodyPart" || issue.path[0] === "equipment" ? "Choose one." : issue.message;
      return setErrors(found);
    }
    setErrors({});
    setFormError(null);
    create.mutate(parsed.data, {
      onSuccess: (exercise) => {
        sheetSelection.setState((s) => ({ ids: [...s.ids, exercise.id] }));
        router.back();
      },
      onError: (error) => setFormError(error.message),
    });
  }

  const choice = <T extends string>(
    label: string,
    options: readonly T[],
    value: T | null,
    onChange: (v: T) => void,
    error?: string,
  ) => (
    <View style={styles.group}>
      <Text variant="label">{label}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => (
          <Chip
            key={option}
            label={capitalise(option)}
            role="radio"
            selected={option === value}
            onPress={() => onChange(option)}
          />
        ))}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <View style={styles.titleRow}>
        <Text variant="title" accessibilityRole="header">
          New exercise
        </Text>
        <Button label="Cancel" variant="plain" tone="link" size="md" onPress={() => router.back()} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            error={errors.name}
            placeholder="e.g. Landmine press"
            maxLength={40}
          />
          <TextField
            label="Muscle group"
            value={muscleGroup}
            onChangeText={setMuscleGroup}
            error={errors.muscleGroup}
            placeholder="e.g. Upper chest"
            hint="Shown under the name, and searchable."
            maxLength={40}
          />
          {choice("Body part", BODY_PARTS, bodyPart, setBodyPart, errors.bodyPart)}
          {choice("Equipment", EQUIPMENT, equipment, setEquipment, errors.equipment)}
          {choice("Type", MECHANICS, mechanic, setMechanic)}
          {choice("Logged in", REPS_UNITS, repsUnit, setRepsUnit)}
          {formError ? (
            <Text tone="danger" accessibilityRole="alert">
              {formError}
            </Text>
          ) : null}
          <Button label="Create exercise" onPress={submit} loading={create.isPending} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.surface },
  flex: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: t.space[4],
    paddingTop: t.space[4],
  },
  content: { padding: t.space[4], gap: t.space[4], paddingBottom: t.space[8] },
  group: { gap: t.space[2] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space[2] },
}));
