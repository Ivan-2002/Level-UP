import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, SectionList, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { BODY_PARTS, type BodyPart, type Exercise, type LoggedSet } from "@levelup/shared";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { Text } from "@/components/Text";
import { authClient } from "@/lib/auth-client";
import { activeWorkoutStore } from "@/stores/device-stores";
import { routineDraftStore } from "@/stores/routine-draft-store";
import { createStyles, useTheme } from "@/theme/use-theme";
import { TAP_TARGET } from "@/theme/tokens";
import { useProfile } from "@/features/profile/use-profile";
import { capitalise, formatSet, topSet } from "@/features/workouts/format";
import { addButtonLabel, groupExercises, initials, toggleSelected } from "./exercise-selection";
import { useExercises, useRecentExercises } from "./use-exercises";

// "Add exercise": one sheet for both the routine builder and the workout in progress.
// Multi-select: tap exercises in the order you want them, then "Add 2 exercises".
//
// Where the picks go is chosen by the `target`: each target is a store, because Expo
// Router can't return a value from a modal. The selection itself is a tiny store too,
// so "Create custom exercise" (another screen) can hand its new exercise back selected.

export type AddExerciseTarget = "workout" | "routine";

export const sheetSelection = createStore<{ ids: string[] }>()(() => ({ ids: [] }));

const addTo: Record<AddExerciseTarget, (exercises: Exercise[]) => void> = {
  workout: (exercises) => activeWorkoutStore.getState().addExercises(exercises),
  routine: (exercises) => routineDraftStore.getState().addExercises(exercises),
};

type Row = { exercise: Exercise; lastSets?: LoggedSet[] };

export function AddExerciseSheet({ target }: { target: AddExerciseTarget }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { data: profile } = useProfile(userId);
  const library = useExercises();
  const recent = useRecentExercises(userId);
  const selected = useStore(sheetSelection, (s) => s.ids);
  const [search, setSearch] = useState("");
  const [bodyPart, setBodyPart] = useState<BodyPart | null>(null);
  const styles = useStyles();
  const t = useTheme();

  useEffect(() => sheetSelection.setState({ ids: [] }), []); // a fresh selection each time it opens

  const groups = useMemo(
    () => groupExercises({ library: library.data ?? [], recent: recent.data?.items ?? [], search, bodyPart }),
    [library.data, recent.data, search, bodyPart],
  );
  const sections = [
    ...(groups.recent.length ? [{ title: "Recently used", data: groups.recent.map((r): Row => ({ exercise: r.exercise, lastSets: r.lastSets })) }] : []),
    ...(groups.all.length ? [{ title: bodyPart ? capitalise(bodyPart) : "All exercises", data: groups.all.map((exercise): Row => ({ exercise })) }] : []),
  ];

  function add() {
    const byId = new Map((library.data ?? []).map((e) => [e.id, e]));
    addTo[target](selected.flatMap((id) => byId.get(id) ?? []));
    router.back();
  }

  const createCustom = (
    <Button
      label="Create custom exercise"
      icon="plus"
      variant="dashed"
      tone="link"
      size="md"
      onPress={() => router.push({ pathname: "/create-exercise", params: { name: search.trim() } })}
      style={styles.create}
    />
  );

  return (
    <SafeAreaView style={styles.sheet} edges={["left", "right"]}>
      <View style={styles.top}>
        <View style={styles.grabber} />
        <View style={styles.titleRow}>
          <Text variant="title" accessibilityRole="header">
            Add exercise
          </Text>
          <Button label="Cancel" variant="plain" tone="link" size="md" onPress={() => router.back()} />
        </View>
        <View style={styles.searchBox}>
          <Icon name="search" size={18} color={t.colors.inkMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises"
            placeholderTextColor={t.colors.inkMuted}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search exercises"
            style={styles.searchInput}
          />
        </View>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Muscle group">
          {[null, ...BODY_PARTS].map((part) => (
            <Chip key={part ?? "all"} label={part ? capitalise(part) : "All"} role="radio" selected={part === bodyPart} onPress={() => setBodyPart(part)} />
          ))}
        </ScrollView>
      </View>

      {library.isPending ? (
        <ActivityIndicator style={styles.loading} color={t.colors.purple} />
      ) : library.isError && !library.data ? (
        <View style={styles.message}>
          <Text tone="inkMuted" style={styles.centeredText}>
            {"Couldn't load the exercise list. Connect once to save it on this phone; after that it works offline."}
          </Text>
          <Button label="Try again" variant="secondary" size="md" onPress={() => library.refetch()} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(row) => row.exercise.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text variant="caption" tone="inkMuted" style={styles.sectionTitle}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <ExerciseRow
              row={item}
              selected={selected.includes(item.exercise.id)}
              unit={profile?.weightUnit ?? "kg"}
              onToggle={() => sheetSelection.setState((s) => ({ ids: toggleSelected(s.ids, item.exercise.id) }))}
            />
          )}
          ListEmptyComponent={
            <Text variant="label" tone="inkMuted" style={[styles.centeredText, styles.empty]}>
              {search.trim() ? `No exercise called “${search.trim()}” yet. Create it as a custom exercise.` : "No exercises match."}
            </Text>
          }
          ListFooterComponent={createCustom}
        />
      )}

      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <Button label={addButtonLabel(selected.length)} onPress={add} disabled={selected.length === 0} />
      </SafeAreaView>
    </SafeAreaView>
  );
}

function ExerciseRow({ row, selected, unit, onToggle }: { row: Row; selected: boolean; unit: "kg" | "lb"; onToggle: () => void }) {
  const styles = useStyles();
  const t = useTheme();
  const { exercise } = row;
  const last = row.lastSets ? topSet(row.lastSets) : null;
  const meta = [exercise.muscleGroup, exercise.equipment, last ? `Last: ${formatSet(last, exercise, unit)}` : null].filter(Boolean).join(" · ");

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${exercise.name}, ${meta}`}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed]}
    >
      <View style={styles.tile}>
        <Text variant="labelStrong" tone="inkMuted">
          {initials(exercise.name)}
        </Text>
      </View>
      <View style={styles.rowText}>
        <Text variant="body" numberOfLines={1}>
          {exercise.name}
        </Text>
        <Text variant="caption" tone="inkMuted" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected ? <Icon name="check" size={14} strokeWidth={3} color={t.colors.onPrimary} /> : null}
      </View>
    </Pressable>
  );
}

const useStyles = createStyles((t) => ({
  sheet: { flex: 1, backgroundColor: t.colors.surface },
  top: { paddingHorizontal: t.space[4], paddingTop: t.space[2], gap: t.space[3] },
  grabber: { width: 40, height: 4, borderRadius: t.radius.pill, backgroundColor: t.colors.border, alignSelf: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  searchBox: {
    height: TAP_TARGET,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceRaised,
    flexDirection: "row",
    alignItems: "center",
    gap: t.space[2],
    paddingHorizontal: t.space[3],
  },
  searchInput: { ...t.type.body, flex: 1, color: t.colors.ink, height: "100%", paddingVertical: 0 },
  chips: { paddingHorizontal: t.space[4], paddingVertical: t.space[3], gap: t.space[2] },
  loading: { marginTop: t.space[8] },
  message: { padding: t.space[4], gap: t.space[4] },
  centeredText: { textAlign: "center" },
  empty: { paddingVertical: t.space[6] },
  list: { paddingHorizontal: t.space[4], paddingBottom: t.space[4], gap: t.space[1] },
  sectionTitle: { paddingTop: t.space[3], paddingBottom: t.space[1], paddingHorizontal: t.space[1] },
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: t.space[3],
    paddingVertical: t.space[2],
    paddingHorizontal: t.space[3],
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  rowSelected: { backgroundColor: t.colors.surfaceRaised, borderColor: t.colors.primary },
  rowPressed: { backgroundColor: t.colors.surfaceRaised },
  tile: { width: 40, height: 40, borderRadius: 10, backgroundColor: t.colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0 },
  // The check circle's edge uses inkMuted, like the set tick: `border` is too faint (1.4:1).
  check: { width: 24, height: 24, borderRadius: t.radius.pill, borderWidth: 2, borderColor: t.colors.inkMuted, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
  create: { marginTop: t.space[2] },
  footer: { paddingTop: t.space[3], paddingHorizontal: t.space[4], paddingBottom: t.space[3], borderTopWidth: 1, borderTopColor: t.colors.border },
}));
